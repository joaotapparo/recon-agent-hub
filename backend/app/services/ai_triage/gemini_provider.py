import asyncio
import logging
from collections import Counter

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.config import settings
from app.models import AIVerdict, Domain, Finding, Severity
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.prompt_templates import (
    build_report_prompt,
    build_triage_prompt,
)
from app.services.ai_triage.report_builder import render_report

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3
_INITIAL_BACKOFF_SECONDS = 1.5


class _GeminiTriageResponse(BaseModel):
    finding_id: int
    verdict: AIVerdict
    severity: Severity | None = None
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    reproduction_steps: str | None = None
    remediation: str | None = None


class _GeminiTriageBatch(BaseModel):
    results: list[_GeminiTriageResponse]


class _GeminiReportResponse(BaseModel):
    summary: str = Field(min_length=1)


def _normalize(parsed: _GeminiTriageResponse) -> TriageResult:
    verdict = parsed.verdict
    severity = parsed.severity

    if verdict == AIVerdict.PENDING:
        verdict = AIVerdict.NEEDS_REVIEW
    if verdict == AIVerdict.TRUE_POSITIVE and severity is None:
        # RF12: achado confirmado sem severidade nao serve - manda pra revisao
        verdict = AIVerdict.NEEDS_REVIEW
    if verdict != AIVerdict.TRUE_POSITIVE:
        severity = None

    return TriageResult(
        verdict=verdict,
        severity=severity,
        confidence=parsed.confidence,
        reasoning=parsed.reasoning,
        reproduction_steps=parsed.reproduction_steps
        if verdict == AIVerdict.TRUE_POSITIVE
        else None,
        remediation=parsed.remediation if verdict == AIVerdict.TRUE_POSITIVE else None,
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

    async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
        response = await self._generate_content(build_triage_prompt(findings))
        if response.text is None:
            raise RuntimeError("Gemini devolveu resposta vazia na triagem")

        results = _GeminiTriageBatch.model_validate_json(response.text).results
        counts = Counter(result.finding_id for result in results)
        expected = {finding.id for finding in findings}
        # id repetido ou que nao foi pedido nao da pra confiar - fica sem resultado e vai pra revisao
        return {
            result.finding_id: _normalize(result)
            for result in results
            if counts[result.finding_id] == 1 and result.finding_id in expected
        }

    async def generate_report(
        self, domain: Domain, findings: list[Finding], *, language: str = "pt-BR"
    ) -> str:
        if not domain.authorized:
            raise ValueError(
                "o dominio precisa estar autorizado para gerar o relatorio"
            )
        response = await self._generate_content(
            build_report_prompt(domain, findings, language=language),
            response_schema=_GeminiReportResponse,
        )
        if response.text is None:
            raise RuntimeError("Gemini devolveu resposta vazia no relatorio")
        summary = _GeminiReportResponse.model_validate_json(
            response.text
        ).summary.strip()
        if not summary:
            raise RuntimeError("Gemini devolveu uma sintese vazia")
        return render_report(domain, findings, summary=summary, language=language)

    async def _generate_content(
        self, prompt: str, *, response_schema: type[BaseModel] = _GeminiTriageBatch
    ) -> types.GenerateContentResponse:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                return await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=settings.gemini_temperature,
                        response_mime_type="application/json",
                        response_schema=response_schema,
                    ),
                )
            except Exception as exc:
                if attempt == _MAX_ATTEMPTS or not _is_retryable(exc):
                    raise
                delay = _INITIAL_BACKOFF_SECONDS * 2 ** (attempt - 1)
                logger.warning(
                    "Gemini falhou (tentativa %d/%d), retry em %.1fs: %s",
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
