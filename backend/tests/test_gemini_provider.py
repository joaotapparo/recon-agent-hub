import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from google.genai.errors import APIError
from pydantic import ValidationError

from app.config import Settings
from app.models import AIVerdict, Finding, FindingCategory
from app.services.ai_triage import gemini_provider


@pytest.fixture
def client(monkeypatch):
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock()))
    )
    monkeypatch.setattr(gemini_provider.genai, "Client", Mock(return_value=client))
    monkeypatch.setattr(gemini_provider.asyncio, "sleep", AsyncMock())
    return client


def test_configura_timeout_em_milissegundos(client, monkeypatch):
    monkeypatch.setattr(gemini_provider.settings, "gemini_timeout_seconds", 12)

    gemini_provider.GeminiTriageProvider(api_key="fake-test-key")

    options = gemini_provider.genai.Client.call_args.kwargs["http_options"]
    assert options.timeout == 12000


@pytest.mark.parametrize("seconds", [0, -1])
def test_rejeita_timeout_que_desativa_limite(seconds):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, gemini_timeout_seconds=seconds)


@pytest.mark.parametrize(
    "error",
    [
        httpx.ReadTimeout("timeout simulado"),
        httpx.ConnectTimeout("timeout simulado"),
        TimeoutError("timeout simulado"),
        APIError(429, {"message": "cota temporariamente excedida"}),
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
