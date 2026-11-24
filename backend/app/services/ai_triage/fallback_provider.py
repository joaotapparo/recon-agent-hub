"""
ai_triage/fallback_provider.py - encadeia providers de IA (Gemini, depois Claude).

Cada chamada vai para o primeiro provider ainda disponivel. Se ele falha por
indisponibilidade (sobrecarga, cota, timeout, resposta invalida), sai da fila
pelo resto do scan e a mesma chamada segue para o proximo - assim um Gemini
sem cota nao atrasa cada lote. Erro de programacao (TypeError etc.) nao e
engolido: sobe normalmente.
"""

import logging

import anthropic
import httpx
from google.genai.errors import APIError as GeminiAPIError
from pydantic import ValidationError

from app.models import Domain, Finding
from app.services.ai_triage.base import AITriageProvider, TriageResult

logger = logging.getLogger(__name__)

PROVIDER_ERRORS = (
    GeminiAPIError,
    anthropic.APIError,
    httpx.HTTPError,
    TimeoutError,
    ValidationError,
    RuntimeError,
)


class FallbackTriageProvider:
    def __init__(self, providers: list[AITriageProvider]) -> None:
        self._providers = list(providers)
        self._served_by: str | None = None
        self.last_summary: str | None = None

    @property
    def model(self) -> str:
        if self._served_by:
            return self._served_by
        return self._providers[0].model if self._providers else "none"

    async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
        return await self._call("triage_batch", findings)

    async def generate_report(
        self, domain: Domain, findings: list[Finding], *, language: str = "pt-BR"
    ) -> str:
        markdown = await self._call("generate_report", domain, findings, language=language)
        return markdown

    async def _call(self, method: str, *args, **kwargs):
        last_error: Exception | None = None
        while self._providers:
            provider = self._providers[0]
            try:
                result = await getattr(provider, method)(*args, **kwargs)
            except PROVIDER_ERRORS as exc:
                last_error = exc
                self._providers.pop(0)
                logger.warning(
                    "IA %s indisponivel (%s: %s) - passando para %s",
                    type(provider).__name__,
                    type(exc).__name__,
                    exc,
                    type(self._providers[0]).__name__ if self._providers else "nenhum",
                )
                continue
            self._served_by = provider.model
            self.last_summary = getattr(provider, "last_summary", None)
            return result
        raise RuntimeError("nenhum provider de IA disponivel neste scan") from last_error
