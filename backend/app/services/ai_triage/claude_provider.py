"""
ai_triage/claude_provider.py - Claude como reserva do Gemini.

Usa os MESMOS prompts, o mesmo formato de resposta e a mesma normalizacao do
provider do Gemini: so muda quem responde. A saida estruturada vem validada
pelo SDK (messages.parse com o schema Pydantic), e a recusa por politica de
seguranca e reencaminhada pelo proprio servidor (fallbacks="default") - os
achados sao de seguranca (chaves, CVEs) e podem cair nos classificadores.
"""

import logging
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.config import settings
from app.models import Domain, Finding
from app.services.ai_triage.base import TriageResult
from app.services.ai_triage.gemini_provider import (
    _GeminiReportResponse as _ReportResponse,
)
from app.services.ai_triage.gemini_provider import (
    _GeminiTriageBatch as _TriageBatch,
)
from app.services.ai_triage.gemini_provider import _normalize, filter_results
from app.services.ai_triage.prompt_templates import (
    build_report_prompt,
    build_triage_prompt,
)
from app.services.ai_triage.report_builder import render_report

logger = logging.getLogger(__name__)

_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_T = TypeVar("_T", bound=BaseModel)


class ClaudeTriageProvider:
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._model = model or settings.claude_model
        # modelo que de fato respondeu (o fallback do servidor pode trocar)
        self._served_by: str | None = None
        self.last_summary: str | None = None
        # o SDK ja repete 408/409/429/5xx e falhas de conexao com backoff
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key or settings.anthropic_api_key,
            timeout=settings.claude_timeout_seconds,
            max_retries=2,
        )

    @property
    def model(self) -> str:
        return self._served_by or self._model

    async def triage_batch(self, findings: list[Finding]) -> dict[int, TriageResult]:
        batch = await self._parse(build_triage_prompt(findings), _TriageBatch)
        return {
            result.finding_id: _normalize(result)
            for result in filter_results(batch.results, findings)
        }

    async def generate_report(
        self, domain: Domain, findings: list[Finding], *, language: str = "pt-BR"
    ) -> str:
        if not domain.authorized:
            raise ValueError("o dominio precisa estar autorizado para gerar o relatorio")
        parsed = await self._parse(
            build_report_prompt(domain, findings, language=language), _ReportResponse
        )
        summary = parsed.summary.strip()
        if not summary:
            raise RuntimeError("Claude devolveu uma sintese vazia")
        self.last_summary = summary
        return render_report(domain, findings, summary=summary, language=language)

    async def _parse(self, prompt: str, output_format: type[_T]) -> _T:
        response = await self._client.beta.messages.parse(
            model=self._model,
            max_tokens=16000,
            betas=[_FALLBACK_BETA],
            fallbacks="default",
            output_config={"effort": settings.claude_effort},
            output_format=output_format,
            messages=[{"role": "user", "content": prompt}],
        )
        if response.stop_reason == "refusal":
            category = response.stop_details.category if response.stop_details else None
            raise RuntimeError(f"Claude recusou a resposta (categoria: {category})")
        if response.stop_reason == "max_tokens":
            raise RuntimeError("resposta do Claude cortada por max_tokens")
        if response.parsed_output is None:
            raise RuntimeError("Claude devolveu resposta vazia")
        self._served_by = response.model or self._model
        return response.parsed_output
