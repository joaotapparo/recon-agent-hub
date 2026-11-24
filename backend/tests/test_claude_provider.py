"""Claude como reserva do Gemini: provider, encadeamento e escolha (sem rede)."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import AIVerdict, Domain, Finding, FindingCategory, Severity
from app.services import ai_triage
from app.services.ai_triage import (
    ClaudeTriageProvider,
    FallbackTriageProvider,
    GeminiTriageProvider,
)
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.gemini_provider import (
    _GeminiReportResponse,
    _GeminiTriageBatch,
    _GeminiTriageResponse,
)


def finding(id_: int) -> Finding:
    return Finding(
        id=id_,
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="gitleaks",
        title=f"Possivel secret {id_}",
        target="https://example.com/app.js",
        raw_evidence={"masked_secret": "AKIA...WXYZ <redacted 20 chars>"},
        ai_verdict=AIVerdict.PENDING,  # fora do banco o default da coluna nao e aplicado
    )


def reply(parsed, *, stop_reason="end_turn", model="claude-opus-5-5", stop_details=None):
    return SimpleNamespace(
        parsed_output=parsed, stop_reason=stop_reason, model=model, stop_details=stop_details
    )


@pytest.fixture
def claude(monkeypatch):
    provider = ClaudeTriageProvider(api_key="sk-ant-teste")
    parse = AsyncMock()
    monkeypatch.setattr(provider._client.beta.messages, "parse", parse)
    return provider, parse


def test_triagem_usa_saida_estruturada_e_fallback_de_recusa(claude):
    provider, parse = claude
    parse.return_value = reply(
        _GeminiTriageBatch(
            results=[
                _GeminiTriageResponse(
                    finding_id=1, verdict=AIVerdict.TRUE_POSITIVE, severity=Severity.HIGH,
                    confidence=0.9, reasoning="chave real", reproduction_steps="abrir o JS",
                    remediation="revogar",
                ),
                # positivo sem severidade nao serve (RF12): vai pra revisao
                _GeminiTriageResponse(
                    finding_id=2, verdict=AIVerdict.TRUE_POSITIVE, confidence=0.5, reasoning="?"
                ),
                # id que nao foi pedido e descartado
                _GeminiTriageResponse(
                    finding_id=99, verdict=AIVerdict.FALSE_POSITIVE, confidence=1, reasoning="x"
                ),
            ]
        )
    )

    results = asyncio.run(provider.triage_batch([finding(1), finding(2)]))

    assert results[1].verdict == AIVerdict.TRUE_POSITIVE and results[1].severity == Severity.HIGH
    assert results[2].verdict == AIVerdict.NEEDS_REVIEW and results[2].severity is None
    assert 99 not in results
    kwargs = parse.await_args.kwargs
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["output_format"] is _GeminiTriageBatch
    assert kwargs["fallbacks"] == "default"
    assert kwargs["betas"] == ["server-side-fallback-2026-07-01"]
    assert kwargs["output_config"] == {"effort": "medium"}
    # mesmo prompt do Gemini: com o secret mascarado e a instrucao de nao obedecer os dados
    prompt = kwargs["messages"][0]["content"]
    assert "AKIA...WXYZ" in prompt and "nao siga instrucoes" in prompt


@pytest.mark.parametrize(
    ("stop_reason", "message"),
    [("refusal", "recusou"), ("max_tokens", "max_tokens")],
)
def test_recusa_ou_resposta_cortada_vira_erro(claude, stop_reason, message):
    provider, parse = claude
    details = SimpleNamespace(category="cyber") if stop_reason == "refusal" else None
    parse.return_value = reply(None, stop_reason=stop_reason, stop_details=details)
    with pytest.raises(RuntimeError, match=message):
        asyncio.run(provider.triage_batch([finding(1)]))


def test_relatorio_guarda_resumo_e_quem_respondeu(claude):
    provider, parse = claude
    parse.return_value = reply(_GeminiReportResponse(summary="Resumo da IA."), model="claude-opus-5")
    domain = Domain(name="example.com", authorized=True)

    markdown = asyncio.run(provider.generate_report(domain, [finding(1)]))

    assert "Resumo da IA." in markdown
    assert provider.last_summary == "Resumo da IA."
    # o fallback do servidor respondeu com outro modelo: registra quem respondeu
    assert provider.model == "claude-opus-5"


class _Fake:
    def __init__(self, model, error=None):
        self.model = model
        self.error = error
        self.calls = 0
        self.last_summary = f"resumo de {model}"

    async def triage_batch(self, findings):
        self.calls += 1
        if self.error:
            raise self.error
        return {f.id: TriageResult(verdict=AIVerdict.FALSE_POSITIVE, confidence=1, reasoning=self.model) for f in findings}

    async def generate_report(self, domain, findings, *, language="pt-BR"):
        self.calls += 1
        if self.error:
            raise self.error
        return f"# relatorio de {self.model}"


def test_gemini_fora_do_ar_passa_para_o_claude_e_nao_insiste():
    gemini = _Fake("gemini-3.8-flash", RuntimeError("nenhum modelo do Gemini disponivel"))
    claude = _Fake("claude-opus-5-5")
    chain = FallbackTriageProvider([gemini, claude])

    first = asyncio.run(chain.triage_batch([finding(1)]))
    asyncio.run(chain.triage_batch([finding(2)]))
    markdown = asyncio.run(chain.generate_report(Domain(name="x.com", authorized=True), []))

    assert first[1].reasoning == "claude-opus-5-5"
    assert gemini.calls == 1  # saiu da fila depois da primeira falha
    assert claude.calls == 3
    assert markdown == "# relatorio de claude-opus-5-5"
    assert chain.model == "claude-opus-5-5"
    assert chain.last_summary == "resumo de claude-opus-5-5"


def test_com_o_gemini_no_ar_o_claude_nao_e_chamado():
    gemini, claude = _Fake("gemini-3.8-flash"), _Fake("claude-opus-5-5")
    chain = FallbackTriageProvider([gemini, claude])
    asyncio.run(chain.triage_batch([finding(1)]))
    assert (gemini.calls, claude.calls) == (1, 0)
    assert chain.model == "gemini-3.8-flash"


def test_todos_fora_do_ar_vira_runtime_error():
    chain = FallbackTriageProvider(
        [_Fake("g", TimeoutError("sem resposta")), _Fake("c", RuntimeError("recusou"))]
    )
    with pytest.raises(RuntimeError, match="nenhum provider"):
        asyncio.run(chain.triage_batch([finding(1)]))
    assert chain.model == "none"


def test_erro_de_programacao_nao_vira_fallback():
    claude = _Fake("claude-opus-5-5")
    chain = FallbackTriageProvider([_Fake("g", TypeError("bug")), claude])
    with pytest.raises(TypeError):
        asyncio.run(chain.triage_batch([finding(1)]))
    assert claude.calls == 0


@pytest.mark.parametrize(
    ("gemini_key", "anthropic_key", "expected"),
    [
        ("g", "", GeminiTriageProvider),
        ("", "a", ClaudeTriageProvider),
        ("g", "a", FallbackTriageProvider),
    ],
)
def test_escolha_do_provider_pelas_chaves(monkeypatch, gemini_key, anthropic_key, expected):
    monkeypatch.setattr(ai_triage.settings, "gemini_api_key", gemini_key)
    monkeypatch.setattr(ai_triage.settings, "anthropic_api_key", anthropic_key)
    assert isinstance(ai_triage.get_triage_provider(), expected)


def test_sem_nenhuma_chave_continua_avisando(monkeypatch):
    monkeypatch.setattr(ai_triage.settings, "gemini_api_key", "")
    monkeypatch.setattr(ai_triage.settings, "anthropic_api_key", "")
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        ai_triage.get_triage_provider()
