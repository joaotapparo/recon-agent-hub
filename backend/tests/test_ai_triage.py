import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AIVerdict, Domain, Finding, FindingCategory, ScanJob, Severity
from app.services import ai_triage
from app.services.ai_triage import gemini_provider
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.gemini_provider import (
    _GeminiTriageResponse,
    _is_retryable,
    _normalize,
)
from app.services.ai_triage.prompt_templates import build_triage_prompt, redact_evidence

_REAL = TriageResult(
    verdict=AIVerdict.TRUE_POSITIVE,
    severity=Severity.HIGH,
    confidence=0.9,
    reasoning="Credencial com formato de chave AWS real.",
    reproduction_steps="Abrir o bundle JS e procurar pelo valor.",
    remediation="Rotacionar a chave e remover do bundle.",
)


class _FakeProvider:
    def __init__(self, fail_ids=(), skip_ids=()) -> None:
        self.batches: list[list[Finding]] = []
        self.fail_ids, self.skip_ids = set(fail_ids), set(skip_ids)

    async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
        self.batches.append(findings)
        if self.fail_ids & {f.id for f in findings}:
            raise RuntimeError("503 simulado")
        return {f.id: _REAL for f in findings if f.id not in self.skip_ids}


class _FailingProvider:
    async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
        raise RuntimeError("429 rate limited")


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _seed_findings(db, *categories: FindingCategory) -> tuple[ScanJob, list[Finding]]:
    domain = Domain(name="exemplo.com", authorized=True)
    db.add(domain)
    db.commit()

    scan_job = ScanJob(domain_id=domain.id)
    db.add(scan_job)
    db.commit()

    findings = [
        Finding(
            scan_job_id=scan_job.id,
            domain_id=domain.id,
            category=category,
            source_tool="gitleaks",
            title="Possivel chave AWS exposta",
            target="exemplo.com/app.js",
            raw_evidence={"match": "AKIAIOSFODNN7EXAMPLE"},
        )
        for category in categories
    ]
    db.add_all(findings)
    db.commit()
    return scan_job, findings


def _seed_pending_finding(db) -> tuple[ScanJob, Finding]:
    scan_job, findings = _seed_findings(db, FindingCategory.EXPOSED_SECRET)
    return scan_job, findings[0]


def test_aplica_resultado_do_provider(db, monkeypatch):
    print(
        "\n[CENARIO 1] A IA diz 'achado real' -> o sistema grava esse veredito no banco"
    )
    scan_job, finding = _seed_pending_finding(db)
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: _FakeProvider())

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(finding)
    assert finding.ai_verdict == AIVerdict.TRUE_POSITIVE
    assert finding.ai_severity == Severity.HIGH
    assert finding.ai_confidence == 0.9
    assert finding.ai_remediation is not None
    assert finding.triaged_at is not None


def test_falha_do_provider_vira_needs_review(db, monkeypatch):
    print(
        "\n[CENARIO 2] A IA cai/da erro -> o achado vira 'revisao necessaria' e o scan nao morre"
    )
    scan_job, finding = _seed_pending_finding(db)
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: _FailingProvider())

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(finding)
    assert finding.ai_verdict == AIVerdict.NEEDS_REVIEW
    assert finding.triaged_at is not None


def test_mascara_secret_mesmo_embutido_no_contexto():
    print(
        "\n[CENARIO 3] Secret no meio de um trecho de codigo -> e mascarado antes de sair"
    )
    evidence = {
        "match": "AKIAIOSFODNN7EXAMPLE",
        "context": 'const k="AKIAIOSFODNN7EXAMPLE";',
    }

    redacted = redact_evidence(evidence)

    assert "AKIAIOSFODNN7EXAMPLE" not in json.dumps(redacted)
    assert redacted["match"].startswith("AKIA")


def test_mascara_secret_embutido_sem_campo_match():
    print(
        "\n[CENARIO 4] Secret so dentro de codigo/url -> mascarado mesmo sem campo 'match'"
    )
    evidence = {"context": 'fetch("/x?token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345")'}

    redacted = redact_evidence(evidence)

    assert "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345" not in json.dumps(redacted)


def test_prompt_mascara_titulo_e_alvo():
    print("\n[CENARIO 5] Titulo e alvo tambem passam pelo mascaramento")
    secret = "sk_live_" + "A" * 24  # Credencial sintetica, exclusiva do teste.
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="gitleaks",
        title=f"Chave {secret} exposta",
        target="https://exemplo.com/app.js?token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
        raw_evidence={"match": secret},
    )

    prompt = build_triage_prompt([finding])

    assert secret not in prompt
    assert "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345" not in prompt


def test_provider_manda_positivo_sem_severidade_pra_revisao():
    print(
        "\n[CENARIO 6] IA confirma achado mas esquece a severidade -> vai pra revisao (RF12)"
    )
    parsed = _GeminiTriageResponse(
        finding_id=1,
        verdict=AIVerdict.TRUE_POSITIVE,
        severity=None,
        confidence=0.9,
        reasoning="parece real",
    )

    assert _normalize(parsed).verdict == AIVerdict.NEEDS_REVIEW


def test_provider_normaliza_vereditos_limites():
    print("\n[CENARIO 7] 'pending' vira revisao e falso positivo perde a severidade")
    pendente = _GeminiTriageResponse(
        finding_id=1, verdict=AIVerdict.PENDING, severity=Severity.HIGH, confidence=0.5, reasoning="?"
    )
    falso_positivo = _GeminiTriageResponse(
        finding_id=2,
        verdict=AIVerdict.FALSE_POSITIVE,
        severity=Severity.HIGH,
        confidence=0.9,
        reasoning="exemplo",
    )

    assert _normalize(pendente).verdict == AIVerdict.NEEDS_REVIEW
    assert _normalize(falso_positivo).severity is None


class _ApiError(Exception):
    def __init__(self, code: int) -> None:
        self.code = code


def test_retry_inclui_erros_transitorios():
    print("\n[CENARIO 8] Erros transitorios (timeout/504/503/429) entram no retry; 404 nao")
    assert _is_retryable(_ApiError(504))
    assert _is_retryable(_ApiError(503))
    assert _is_retryable(_ApiError(429))
    assert _is_retryable(TimeoutError())
    assert not _is_retryable(_ApiError(404))


def test_ignora_finding_ja_triado(db, monkeypatch):
    print("\n[CENARIO 9] Achado ja classificado -> a IA nao e chamada de novo")
    scan_job, finding = _seed_pending_finding(db)
    finding.ai_verdict = AIVerdict.FALSE_POSITIVE
    db.commit()

    class _ExplodingProvider:
        async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
            raise AssertionError("nao deveria triar um finding ja classificado")

    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: _ExplodingProvider())

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(finding)
    assert finding.ai_verdict == AIVerdict.FALSE_POSITIVE


def test_timeout_esgotado_vira_needs_review(db, monkeypatch):
    scan_job, finding = _seed_pending_finding(db)
    generate = AsyncMock(side_effect=httpx.ReadTimeout("timeout simulado"))
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    monkeypatch.setattr(gemini_provider.genai, "Client", lambda **kwargs: client)
    sleep = AsyncMock()
    monkeypatch.setattr(gemini_provider.asyncio, "sleep", sleep)
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: provider)

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(finding)
    assert generate.await_count == 3
    assert [call.args[0] for call in sleep.await_args_list] == [1.5, 3.0]
    assert finding.ai_verdict == AIVerdict.NEEDS_REVIEW
    assert finding.triaged_at is not None


def test_lote_agrupa_por_categoria_e_respeita_o_tamanho(db, monkeypatch):
    secret, port = FindingCategory.EXPOSED_SECRET, FindingCategory.OPEN_PORT
    scan_job, findings = _seed_findings(db, secret, port, secret, secret)
    provider = _FakeProvider()
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: provider)
    monkeypatch.setattr(ai_triage.settings, "ai_triage_batch_size", 2)

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    assert [[f.category for f in batch] for batch in provider.batches] == [
        [secret, secret],
        [secret],
        [port],
    ]
    for finding in findings:
        db.refresh(finding)
        assert finding.ai_verdict == AIVerdict.TRUE_POSITIVE


def test_achado_que_nao_volta_no_lote_vai_pra_revisao(db, monkeypatch):
    secret = FindingCategory.EXPOSED_SECRET
    scan_job, (devolvido, esquecido) = _seed_findings(db, secret, secret)
    provider = _FakeProvider(skip_ids={esquecido.id})
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: provider)

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(devolvido)
    db.refresh(esquecido)
    assert len(provider.batches) == 1
    assert devolvido.ai_verdict == AIVerdict.TRUE_POSITIVE
    assert esquecido.ai_verdict == AIVerdict.NEEDS_REVIEW
    assert esquecido.ai_severity is None


def test_falha_de_um_lote_nao_afeta_os_outros(db, monkeypatch):
    secret = FindingCategory.EXPOSED_SECRET
    scan_job, (ok, falhou) = _seed_findings(db, secret, secret)
    provider = _FakeProvider(fail_ids={falhou.id})
    monkeypatch.setattr(ai_triage, "get_triage_provider", lambda: provider)
    monkeypatch.setattr(ai_triage.settings, "ai_triage_batch_size", 1)

    asyncio.run(ai_triage.triage_findings(db, scan_job))

    db.refresh(ok)
    db.refresh(falhou)
    assert ok.ai_verdict == AIVerdict.TRUE_POSITIVE
    assert falhou.ai_verdict == AIVerdict.NEEDS_REVIEW
    assert falhou.triaged_at is not None
