"""Gera uma demonstração offline; use --real para chamar o Gemini com os mesmos dados fictícios."""

import argparse
import asyncio
import json
import logging
import tempfile
from contextlib import nullcontext
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base
from app.models import (
    AIVerdict,
    Domain,
    Finding,
    FindingCategory,
    Report,
    ScanJob,
    Severity,
)
from app.services import ai_triage
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.report_builder import render_report
from demo_ai_triage import CASOS, _MockProvider


class _DemoProvider(_MockProvider):
    async def triage(self, finding: Finding) -> TriageResult:
        result = await super().triage(finding)
        if result.verdict == AIVerdict.TRUE_POSITIVE:
            result = replace(
                result,
                reproduction_steps=f"1. Consultar {finding.target}.\n2. Procurar pelo prefixo sk_live_.",
            )
        return result

    async def generate_report(self, domain, findings, *, language="pt-BR") -> str:
        return render_report(
            domain,
            findings,
            summary="Os dados fictícios mostram exposição de configuração e credencial, "
            "além de um endpoint que ainda precisa de revisão. Priorize remover os dados "
            "sensíveis dos arquivos públicos e revisar o contexto do endpoint.",
            language=language,
        )


class _DemoLog(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.errors = []

    def emit(self, record) -> None:
        error = record.exc_info[1] if record.exc_info else record.args[-1]
        detail = {
            "type": type(error).__name__
            if isinstance(error, Exception)
            else str(error),
            "code": getattr(error, "code", None),
        }
        self.errors.append(detail)
        print(f"Aviso da IA: {detail['type']} (HTTP {detail['code']}).", flush=True)


def _seed(db: Session) -> ScanJob:
    domain = Domain(name="demo.recon.test", authorized=True)
    scan = ScanJob(domain=domain)
    db.add(scan)
    db.flush()
    common = {"domain_id": domain.id, "scan_job_id": scan.id}
    for _, sample in CASOS:
        db.add(
            Finding(
                **common,
                category=sample.category,
                source_tool=sample.source_tool,
                title=sample.title,
                target="https://" + sample.target.replace("exemplo.com", domain.name),
                raw_evidence=sample.raw_evidence,
            )
        )
    db.add_all(
        [
            Finding(
                **common,
                category=FindingCategory.MISCONFIGURATION,
                source_tool="demo",
                title="Arquivo .env disponível publicamente",
                target=f"https://{domain.name}/.env",
                raw_evidence={
                    "http_status": 200,
                    "password": "DemoPassword!2026",
                    "line": 4,
                },
                ai_verdict=AIVerdict.TRUE_POSITIVE,
                ai_severity=Severity.CRITICAL,
                ai_reasoning="A coleta fictícia mostra resposta 200 e uma senha no arquivo .env.",
                ai_reproduction_steps=f"1. Consultar a evidência de https://{domain.name}/.env.\n"
                "2. Conferir o status 200 e a presença da configuração sensível.",
                ai_remediation="Bloquear o acesso público ao .env, remover o arquivo publicado "
                "e rotacionar as credenciais expostas.",
            ),
            Finding(
                **common,
                category=FindingCategory.EXPOSED_ENDPOINT,
                source_tool="demo",
                title="Referência a endpoint administrativo no JS",
                target=f"https://{domain.name}/app.js",
                raw_evidence={"path": "/api/admin", "http_status": None},
                ai_verdict=AIVerdict.NEEDS_REVIEW,
                ai_reasoning="A referência existe, mas não há evidência de acesso sem autorização.",
            ),
        ]
    )
    db.commit()
    return scan


async def _analyze(db: Session, scan: ScanJob, *, retry_summary: bool) -> Report:
    if not retry_summary:
        await ai_triage.triage_findings(db, scan)
    print("Gerando e salvando o relatório...", flush=True)
    return await ai_triage.generate_report(db, scan)


def run_demo(output: Path, *, real: bool = False, retry_summary: bool = False) -> dict:
    if retry_summary and not (output / "demo.db").is_file():
        raise ValueError("o diretório precisa conter o demo.db de uma rodada anterior")
    output.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{output / 'demo.db'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    mode = "Gemini real" if real else "MOCK offline"
    log = _DemoLog()
    logger = logging.getLogger("app.services.ai_triage")
    previous_level, previous_propagation = logger.level, logger.propagate
    logger.setLevel(logging.WARNING)
    logger.propagate = False
    logger.addHandler(log)
    try:
        with Session(engine) as db:
            scan = db.query(ScanJob).one() if retry_summary else _seed(db)
            if scan.domain.name != "demo.recon.test":
                raise ValueError(
                    "este script só pode usar o banco fictício da demonstração"
                )
            factory = (
                nullcontext()
                if real
                else patch(
                    "app.services.ai_triage.get_triage_provider",
                    return_value=_DemoProvider(),
                )
            )
            with factory:
                if not retry_summary:
                    print(
                        f"Modo: {mode}. Triando 3 achados fictícios, sem executar scan.",
                        flush=True,
                    )
                report = asyncio.run(_analyze(db, scan, retry_summary=retry_summary))
            if not real:
                report.ai_model_used = "mock"
                db.commit()
                db.refresh(report)
            report_id = report.id

        with Session(engine) as db:
            report = db.get(Report, report_id)
            findings = db.query(Finding).order_by(Finding.id).all()
            api_ok = sum(
                f.ai_reasoning != "Triagem automatica indisponivel no momento."
                for f in findings[:3]
            )
            result = {
                "mode": mode,
                "model": report.ai_model_used,
                "triage_responses": api_ok,
                "triage_expected": 3,
                "triage_reused": retry_summary,
                "summary": report.summary,
                "persisted": bool(report.markdown_content),
                "errors": log.errors,
                "findings": [
                    {
                        "id": f.id,
                        "title": f.title,
                        "verdict": f.ai_verdict.value,
                        "severity": f.ai_severity.value if f.ai_severity else None,
                    }
                    for f in findings
                ],
            }
            notice = (
                "> DEMONSTRAÇÃO: dados fictícios, domínio reservado .test e nenhum scan executado.\n"
                f"> Modo: {mode}. Apenas os 3 candidatos passam pela IA; o .env e o endpoint "
                "ilustram classificações já existentes.\n\n"
            )
            suffix = "-resumo" if retry_summary else ""
            report_path = output / f"relatorio{suffix}.md"
            validation_path = output / f"validacao{suffix}.json"
            report_path.write_text(notice + report.markdown_content, encoding="utf-8")
            validation_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
    finally:
        logger.removeHandler(log)
        logger.setLevel(previous_level)
        logger.propagate = previous_propagation
        engine.dispose()
    print(f"Relatório: {report_path}", flush=True)
    print(f"Validação: {validation_path}", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--real", action="store_true", help="usa a API real do Gemini")
    parser.add_argument(
        "--retry-summary",
        type=Path,
        help="reaproveita o banco da demo e refaz apenas o resumo",
    )
    args = parser.parse_args()
    demos = settings.data_dir / "demos"
    demos.mkdir(parents=True, exist_ok=True)
    output = args.retry_summary or Path(
        tempfile.mkdtemp(prefix="gemini-" if args.real else "mock-", dir=demos)
    )
    result = run_demo(output, real=args.real, retry_summary=bool(args.retry_summary))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.real and (result["triage_responses"] != 3 or result["model"] == "none"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
