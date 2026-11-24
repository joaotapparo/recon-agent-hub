"""
Avaliacao da triagem por IA com um conjunto rotulado (issue #29, secao 11.5).

Nao treina nem ajusta o modelo: so mede quanto a triagem que o sistema ja
usa acerta. Cada caso de eval/triage_cases.json tem o gabarito (expected)
definido pela equipe. O script grava os casos num banco em memoria e chama
o mesmo caminho de producao (ai_triage.triage_findings: lotes por
categoria, prompt, validacao da resposta, needs_review), depois compara a
decisao da IA com o gabarito.

    uv run python eval_ai_triage.py            # 3 rodadas (a IA nao e deterministica)
    uv run python eval_ai_triage.py --runs 1

Precisa de GEMINI_API_KEY no backend/.env. Os resultados vao para
eval/results/ (JSON com cada resposta e Markdown com as metricas).

Classe positiva = achado real. "needs_review" e a IA dizendo "nao sei":
nao e acerto nem erro de classificacao, porque o achado vai para o
profissional decidir; por isso aparece separado (cobertura).
"""

import argparse
import asyncio
import json
import statistics
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.models import AIVerdict, Domain, Finding, FindingCategory, ScanJob

BACKEND_DIR = Path(__file__).resolve().parent
CASES_PATH = BACKEND_DIR / "eval" / "triage_cases.json"
RESULTS_DIR = BACKEND_DIR / "eval" / "results"

REAL = AIVerdict.TRUE_POSITIVE.value
FAKE = AIVerdict.FALSE_POSITIVE.value
REVIEW = AIVerdict.NEEDS_REVIEW.value

# needs_review por falha da API (e nao por decisao do modelo) invalida a rodada
_API_FAILURE_PREFIXES = ("Triagem automatica indisponivel", "Triagem por IA nao executada")


def load_cases(path: Path = CASES_PATH) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


async def run_once(cases: list[dict]) -> tuple[list[dict], str]:
    """Roda a triagem de producao uma vez sobre todos os casos."""
    from app.services import ai_triage

    provider = ai_triage.get_triage_provider()  # ValueError sem GEMINI_API_KEY
    original = ai_triage.get_triage_provider
    ai_triage.get_triage_provider = lambda: provider  # pra saber qual modelo respondeu
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            domain = Domain(name="loja-exemplo.com.br", authorized=True)
            db.add(domain)
            db.flush()
            scan = ScanJob(domain_id=domain.id)
            db.add(scan)
            db.flush()
            by_finding: dict[int, dict] = {}
            for case in cases:
                finding = Finding(
                    scan_job_id=scan.id,
                    domain_id=domain.id,
                    category=FindingCategory(case["category"]),
                    source_tool=case["source_tool"],
                    title=case["title"],
                    target=case["target"],
                    raw_evidence=case["raw_evidence"],
                )
                db.add(finding)
                db.flush()
                by_finding[finding.id] = case
            db.commit()

            await ai_triage.triage_findings(db, scan)

            rows = []
            for finding in db.query(Finding).order_by(Finding.id):
                case = by_finding[finding.id]
                reasoning = finding.ai_reasoning or ""
                rows.append(
                    {
                        "id": case["id"],
                        "category": case["category"],
                        "expected": case["expected"],
                        "predicted": finding.ai_verdict.value,
                        "severity": finding.ai_severity.value if finding.ai_severity else None,
                        "confidence": finding.ai_confidence,
                        "reasoning": reasoning,
                        "api_failure": reasoning.startswith(_API_FAILURE_PREFIXES),
                    }
                )
        try:
            model = provider.model
        except IndexError:  # todos os modelos da lista cairam nesta rodada
            model = "nenhum (todos indisponiveis)"
        return rows, model
    finally:
        ai_triage.get_triage_provider = original
        engine.dispose()


def _ratio(num: int, den: int) -> float | None:
    return num / den if den else None


def compute_metrics(rows: list[dict]) -> dict:
    """Metricas de uma rodada. Classe positiva = achado real (true_positive)."""
    matrix = {exp: {pred: 0 for pred in (REAL, FAKE, REVIEW)} for exp in (REAL, FAKE)}
    for row in rows:
        predicted = row["predicted"] if row["predicted"] in (REAL, FAKE) else REVIEW
        matrix[row["expected"]][predicted] += 1

    real_total = sum(matrix[REAL].values())
    fake_total = sum(matrix[FAKE].values())
    total = real_total + fake_total
    tp, fn_fake, fn_review = matrix[REAL][REAL], matrix[REAL][FAKE], matrix[REAL][REVIEW]
    fp, tn = matrix[FAKE][REAL], matrix[FAKE][FAKE]
    decided = total - fn_review - matrix[FAKE][REVIEW]

    return {
        "total": total,
        "confusion_matrix": matrix,
        # de todos os casos, quantos a IA decidiu certo (needs_review conta como nao acerto)
        "accuracy": _ratio(tp + tn, total),
        # so entre os casos em que a IA decidiu (sem needs_review)
        "accuracy_decided": _ratio(tp + tn, decided),
        # dos que a IA chamou de real, quantos eram reais: mede alarme falso
        "precision": _ratio(tp, tp + fp),
        # dos reais, quantos a IA confirmou
        "recall": _ratio(tp, real_total),
        # dos falsos positivos do gabarito, quantos a IA descartou corretamente
        "specificity": _ratio(tn, fake_total),
        # quantos casos a IA decidiu sem mandar para revisao
        "coverage": _ratio(decided, total),
        # o pior erro: achado real descartado como falso positivo (some da vista)
        "dangerous_misses": fn_fake,
        "dangerous_miss_rate": _ratio(fn_fake, real_total),
        "api_failures": sum(row["api_failure"] for row in rows),
    }


def summarize(runs: list[dict]) -> dict:
    """Media, minimo e maximo de cada metrica entre as rodadas."""
    keys = [
        "accuracy", "accuracy_decided", "precision", "recall",
        "specificity", "coverage", "dangerous_miss_rate",
    ]
    out = {}
    for key in keys:
        values = [run[key] for run in runs if run[key] is not None]
        out[key] = (
            {"mean": statistics.mean(values), "min": min(values), "max": max(values)} if values else None
        )
    return out


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def render_markdown(result: dict) -> str:
    runs = result["runs"]
    summary = result["summary"]
    labels = {
        "accuracy": "Acurácia (todos os casos)",
        "accuracy_decided": "Acurácia (só casos decididos)",
        "precision": "Precisão (alarme falso)",
        "recall": "Recall (achados reais confirmados)",
        "specificity": "Especificidade (falsos positivos descartados)",
        "coverage": "Cobertura (decididos sem revisão)",
        "dangerous_miss_rate": "Reais descartados como falso positivo",
    }
    lines = [
        "# Avaliação da triagem por IA",
        "",
        f"- Data: {result['generated_at']}",
        f"- Modelo(s): {', '.join(sorted(set(result['models'])))}",
        f"- Casos: {runs[0]['total']} ({result['cases_by_label'][REAL]} reais, {result['cases_by_label'][FAKE]} falsos positivos)",
        f"- Rodadas: {len(runs)} (temperatura {settings.gemini_temperature}; a IA não é determinística)",
        "",
        "| Métrica | Média | Mín. | Máx. |",
        "|---|---|---|---|",
    ]
    for key, label in labels.items():
        stats = summary[key]
        if stats is None:
            lines.append(f"| {label} | n/a | n/a | n/a |")
        else:
            lines.append(f"| {label} | {_pct(stats['mean'])} | {_pct(stats['min'])} | {_pct(stats['max'])} |")

    lines += ["", "## Matriz de confusão (soma das rodadas)", "",
              "| Gabarito \\ IA | Real | Falso positivo | Revisão |", "|---|---|---|---|"]
    for expected, label in ((REAL, "Real"), (FAKE, "Falso positivo")):
        cells = [sum(run["confusion_matrix"][expected][pred] for run in runs) for pred in (REAL, FAKE, REVIEW)]
        lines.append(f"| {label} | {cells[0]} | {cells[1]} | {cells[2]} |")

    errors: dict[str, list[str]] = {}
    for i, rows in enumerate(result["predictions"], start=1):
        for row in rows:
            if row["predicted"] != row["expected"]:
                errors.setdefault(row["id"], []).append(f"rodada {i}: {row['predicted']}")
    lines += ["", "## Casos em que a IA divergiu do gabarito", ""]
    if not errors:
        lines.append("Nenhum.")
    for case_id, where in sorted(errors.items()):
        lines.append(f"- **{case_id}** (gabarito: {result['expected_by_id'][case_id]}): {'; '.join(where)}")
    return "\n".join(lines) + "\n"


async def evaluate(runs: int, cases: list[dict]) -> dict:
    predictions, metrics, models = [], [], []
    for i in range(1, runs + 1):
        print(f"rodada {i}/{runs}...", file=sys.stderr)
        rows, model = await run_once(cases)
        run_metrics = compute_metrics(rows)
        if run_metrics["api_failures"]:
            raise RuntimeError(
                f"{run_metrics['api_failures']} achado(s) sem resposta por falha da API do Gemini "
                f"na rodada {i}; a rodada nao mede o modelo. Tente de novo mais tarde."
            )
        predictions.append(rows)
        metrics.append(run_metrics)
        models.append(model)
    return {
        "generated_at": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
        "models": models,
        "cases_by_label": {
            REAL: sum(c["expected"] == REAL for c in cases),
            FAKE: sum(c["expected"] == FAKE for c in cases),
        },
        "expected_by_id": {c["id"]: c["expected"] for c in cases},
        "runs": metrics,
        "summary": summarize(metrics),
        "predictions": predictions,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runs", type=int, default=3, help="quantas rodadas (padrao: 3)")
    parser.add_argument("--out", type=Path, default=RESULTS_DIR, help="pasta dos resultados")
    args = parser.parse_args(argv)

    try:
        result = asyncio.run(evaluate(args.runs, load_cases()))
    except (ValueError, RuntimeError) as exc:
        print(f"erro: {exc}", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M")
    markdown = render_markdown(result)
    (args.out / f"avaliacao-{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.out / f"avaliacao-{stamp}.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    print(f"resultados em {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
