import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from google.genai.errors import APIError
from pydantic import ValidationError

from app.config import Settings
from app.models import AIVerdict, Domain, Finding, FindingCategory, Severity
from app.services.ai_triage import gemini_provider


@pytest.fixture
def client(monkeypatch):
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock()))
    )
    monkeypatch.setattr(gemini_provider.genai, "Client", Mock(return_value=client))
    monkeypatch.setattr(gemini_provider.asyncio, "sleep", AsyncMock())
    return client


@pytest.mark.parametrize("seconds", [12, 60])
def test_configura_timeout_em_milissegundos(client, monkeypatch, seconds):
    monkeypatch.setattr(gemini_provider.settings, "gemini_timeout_seconds", seconds)

    gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    options = gemini_provider.genai.Client.call_args.kwargs["http_options"]
    assert options.timeout == seconds * 1000


@pytest.mark.parametrize("seconds", [0, -1])
def test_rejeita_timeout_que_desativa_limite(seconds):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, gemini_timeout_seconds=seconds)


def test_configuracao_padrao_do_gemini(monkeypatch):
    monkeypatch.delenv("GEMINI_TEMPERATURE", raising=False)
    monkeypatch.delenv("GEMINI_TIMEOUT_SECONDS", raising=False)

    config = Settings(_env_file=None)
    assert config.gemini_temperature == 1.0
    assert config.gemini_timeout_seconds == 60


def test_encaminha_temperatura_ao_gemini(client, monkeypatch):
    monkeypatch.setattr(gemini_provider.settings, "gemini_temperature", 1.0)
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    asyncio.run(provider._generate_content("prompt de teste"))

    config = client.aio.models.generate_content.call_args.kwargs["config"]
    assert config.temperature == 1.0


@pytest.mark.parametrize(
    "error",
    [
        httpx.ReadTimeout("timeout simulado"),
        httpx.ConnectTimeout("timeout simulado"),
        TimeoutError("timeout simulado"),
        APIError(429, {"message": "cota temporariamente excedida"}),
        APIError(503, {"message": "servico temporariamente indisponivel"}),
    ],
)
def test_repete_falha_transitoria_e_retorna_resposta(client, error):
    response = SimpleNamespace(text="resposta simulada")
    client.aio.models.generate_content.side_effect = [error, response]
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    assert asyncio.run(provider._generate_content("prompt de teste")) is response
    assert client.aio.models.generate_content.await_count == 2
    gemini_provider.asyncio.sleep.assert_awaited_once_with(1.5)


def test_nao_repete_erro_de_requisicao(client):
    client.aio.models.generate_content.side_effect = APIError(
        400, {"message": "request invalido"}
    )
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    with pytest.raises(APIError):
        asyncio.run(provider._generate_content("prompt de teste"))

    assert client.aio.models.generate_content.await_count == 1
    gemini_provider.asyncio.sleep.assert_not_awaited()


def test_provider_valida_json_e_encaminha_positivo_incompleto_para_revisao(client):
    client.aio.models.generate_content.return_value = SimpleNamespace(
        text='{"verdict":"true_positive","confidence":0.9,"reasoning":"parece real"}'
    )
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="regex",
        title="Credencial",
        target="https://example.com/app.js",
        raw_evidence={"password": "abc123!"},
    )

    result = asyncio.run(provider.triage(finding))

    assert result.verdict == AIVerdict.NEEDS_REVIEW
    assert result.severity is None
    assert (
        "abc123!" not in client.aio.models.generate_content.call_args.kwargs["contents"]
    )


def test_gemini_sintetiza_resumo_mas_codigo_preserva_achados(client):
    client.aio.models.generate_content.return_value = SimpleNamespace(
        text='{"summary":"Há uma credencial exposta que precisa de correção."}'
    )
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")
    domain = Domain(name="example.com", authorized=True)
    finding = Finding(
        category=FindingCategory.EXPOSED_SECRET,
        source_tool="regex",
        title="Credencial exposta",
        target="https://example.com/app.js",
        raw_evidence={"password": "abc123!"},
        ai_verdict=AIVerdict.TRUE_POSITIVE,
        ai_severity=Severity.HIGH,
        ai_reproduction_steps="Abrir o arquivo JS.",
        ai_remediation="Rotacionar a credencial.",
    )

    markdown = asyncio.run(provider.generate_report(domain, [finding]))

    assert "Há uma credencial exposta" in markdown
    assert "HIGH" in markdown
    assert "Abrir o arquivo JS." in markdown
    assert "Rotacionar a credencial." in markdown
    assert "abc123!" not in markdown
    request = client.aio.models.generate_content.call_args.kwargs
    assert request["config"].response_schema is gemini_provider._GeminiReportResponse
    assert "abc123!" not in request["contents"]


@pytest.mark.parametrize("text", [None, '{"summary":"   "}', '{"summary":""}'])
def test_gemini_rejeita_sintese_vazia(client, text):
    client.aio.models.generate_content.return_value = SimpleNamespace(text=text)
    provider = gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    with pytest.raises((RuntimeError, ValidationError)):
        asyncio.run(
            provider.generate_report(Domain(name="example.com", authorized=True), [])
        )


@pytest.mark.parametrize(
    "verdict", [AIVerdict.FALSE_POSITIVE, AIVerdict.NEEDS_REVIEW, AIVerdict.PENDING]
)
def test_normalizacao_remove_conclusoes_de_achado_nao_confirmado(verdict):
    parsed = gemini_provider._GeminiTriageResponse(
        verdict=verdict,
        severity=Severity.CRITICAL,
        confidence=0.2,
        reasoning="Sem evidência suficiente.",
        reproduction_steps="Passo sem base na evidência.",
        remediation="Correção sem confirmação.",
    )

    result = gemini_provider._normalize(parsed)

    assert result.severity is None
    assert result.reproduction_steps is None
    assert result.remediation is None
