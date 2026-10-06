import asyncio
import logging

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.config import settings
from app.models import AIVerdict, Finding, Severity
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.prompt_templates import build_triage_prompt

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3
_INITIAL_BACKOFF_SECONDS = 1.5


class _GeminiTriageResponse(BaseModel):
    verdict: AIVerdict
    severity: Severity | None = None
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    reproduction_steps: str | None = None
    remediation: str | None = None


def _normalize(parsed: _GeminiTriageResponse) -> TriageResult:
    verdict = parsed.verdict
    severity = parsed.severity

    if verdict == AIVerdict.PENDING:
        verdict = AIVerdict.NEEDS_REVIEW
    if verdict == AIVerdict.FALSE_POSITIVE:
        severity = None
    elif verdict == AIVerdict.TRUE_POSITIVE and severity is None:
        # RF12: achado confirmado sem severidade nao serve - manda pra revisao
        verdict = AIVerdict.NEEDS_REVIEW

    return TriageResult(
        verdict=verdict,
        severity=severity,
        confidence=parsed.confidence,
        reasoning=parsed.reasoning,
        reproduction_steps=parsed.reproduction_steps,
        remediation=parsed.remediation,
    )


class GeminiTriageProvider:
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._model = model or settings.gemini_model
        self._client = genai.Client(
            api_key=api_key or settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=settings.gemini_timeout_seconds * 1000
            ),
        )

    async def triage(self, finding: Finding) -> TriageResult:
        response = await self._generate_content(build_triage_prompt(finding))
        if response.text is None:
            raise RuntimeError("Gemini devolveu resposta vazia na triagem")

        parsed = _GeminiTriageResponse.model_validate_json(response.text)
        return _normalize(parsed)

    async def _generate_content(self, prompt: str) -> types.GenerateContentResponse:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                return await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=settings.gemini_temperature,
                        response_mime_type="application/json",
                        response_schema=_GeminiTriageResponse,
                    ),
                )
            except Exception as exc:
                if attempt == _MAX_ATTEMPTS or not _is_retryable(exc):
                    raise
                delay = _INITIAL_BACKOFF_SECONDS * 2 ** (attempt - 1)
                logger.warning(
                    "Gemini falhou na triagem (tentativa %d/%d), retry em %.1fs: %s",
                    attempt,
                    _MAX_ATTEMPTS,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)

        raise RuntimeError(
            "inalcancavel: loop de retry terminou sem retornar ou levantar"
        )


def _is_retryable(exc: Exception) -> bool:
    return isinstance(exc, (httpx.TimeoutException, TimeoutError)) or (
        getattr(exc, "code", None) in _RETRYABLE_STATUS_CODES
    )
