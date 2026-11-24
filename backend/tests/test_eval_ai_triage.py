"""Avaliacao da triagem por IA: conjunto rotulado e calculo das metricas (offline)."""

import asyncio
import re

import pytest

import eval_ai_triage as ev
from app.models import AIVerdict, Severity
from app.services import ai_triage
from app.services.ai_triage.base import TriageResult
from app.services.js_scanner.secret_scanner import _FALLBACK_RULES


@pytest.fixture(scope="module")
def cases():
    return ev.load_cases()


def test_conjunto_e_balanceado_e_tem_justificativa(cases):
    assert len(cases) >= 40
    labels = [c["expected"] for c in cases]
    assert labels.count(ev.REAL) == labels.count(ev.FAKE)
    assert len({c["id"] for c in cases}) == len(cases)
    assert all(c["why"].strip() for c in cases)


def test_conjunto_nao_tem_secret_em_claro(cases):
    """A IA so recebe valor mascarado em producao; o conjunto tem que ser igual."""
    for case in (c for c in cases if c["category"] == "exposed_secret"):
        ev_ = case["raw_evidence"]
        assert "<redacted" in ev_["masked_secret"]
        assert ev_["masked_secret"] in ev_["context"]
        text = ev_["context"].replace(ev_["masked_secret"], "")
        for rule, pattern in _FALLBACK_RULES:
            if rule != "generic-api-key":
                assert not pattern.search(text), (case["id"], rule)


def row(expected, predicted, api_failure=False):
    return {"expected": expected, "predicted": predicted, "api_failure": api_failure}


def test_metricas_separam_revisao_de_erro():
    rows = (
        [row(ev.REAL, ev.REAL)] * 6          # reais confirmados
        + [row(ev.REAL, ev.FAKE)] * 1        # real descartado: erro perigoso
        + [row(ev.REAL, ev.REVIEW)] * 1      # real mandado pra revisao
        + [row(ev.FAKE, ev.FAKE)] * 5        # falsos positivos descartados
        + [row(ev.FAKE, ev.REAL)] * 2        # alarme falso
        + [row(ev.FAKE, ev.REVIEW)] * 1
    )
    m = ev.compute_metrics(rows)

    assert m["total"] == 16
    assert m["confusion_matrix"][ev.REAL] == {ev.REAL: 6, ev.FAKE: 1, ev.REVIEW: 1}
    assert m["accuracy"] == pytest.approx(11 / 16)
    assert m["accuracy_decided"] == pytest.approx(11 / 14)
    assert m["precision"] == pytest.approx(6 / 8)
    assert m["recall"] == pytest.approx(6 / 8)
    assert m["specificity"] == pytest.approx(5 / 8)
    assert m["coverage"] == pytest.approx(14 / 16)
    assert m["dangerous_misses"] == 1


def test_sem_nenhum_positivo_previsto_precisao_fica_indefinida():
    m = ev.compute_metrics([row(ev.REAL, ev.REVIEW), row(ev.FAKE, ev.FAKE)])
    assert m["precision"] is None
    assert ev.summarize([m])["precision"] is None


class _GabaritoProvider:
    """Acerta tudo, menos os ids pedidos: simula o Gemini sem rede."""

    model = "fake-model"

    def __init__(self, cases, wrong=()):
        self._expected = {c["title"]: c for c in cases}
        self._wrong = set(wrong)

    async def triage_batch(self, findings):
        out = {}
        for f in findings:
            case = self._expected[f.title]
            verdict = AIVerdict(case["expected"])
            if case["id"] in self._wrong:
                verdict = AIVerdict.FALSE_POSITIVE if verdict == AIVerdict.TRUE_POSITIVE else AIVerdict.TRUE_POSITIVE
            out[f.id] = TriageResult(
                verdict=verdict,
                severity=Severity.HIGH if verdict == AIVerdict.TRUE_POSITIVE else None,
                confidence=0.9,
                reasoning="ok",
            )
        return out


def test_avaliacao_usa_o_caminho_de_producao_e_gera_relatorio(cases, monkeypatch):
    provider = _GabaritoProvider(cases, wrong={"S-R01", "S-F02"})
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: provider)

    result = asyncio.run(ev.evaluate(2, cases))

    run = result["runs"][0]
    assert result["models"] == ["fake-model", "fake-model"]
    assert run["dangerous_misses"] == 1
    assert run["accuracy"] == pytest.approx(38 / 40)
    md = ev.render_markdown(result)
    assert "| Acurácia (todos os casos) | 95.0% |" in md
    assert re.search(r"\*\*S-R01\*\* \(gabarito: true_positive\): rodada 1: false_positive; rodada 2", md)
    # a avaliacao nao deixa o provider trocado depois de rodar
    assert ai_triage.get_triage_provider() is provider


def test_falha_da_api_invalida_a_rodada(cases, monkeypatch):
    class Quebrado:
        model = "x"

        async def triage_batch(self, findings):
            raise TimeoutError("sem resposta")

    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: Quebrado())
    with pytest.raises(RuntimeError, match="falha da API"):
        asyncio.run(ev.evaluate(1, cases))


def test_sem_chave_o_script_avisa(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(ev.settings, "gemini_api_key", "")
    assert ev.main(["--runs", "1", "--out", str(tmp_path)]) == 1
    assert "GEMINI_API_KEY" in capsys.readouterr().err
