"""
Servico Agente de IA (RF10-RF13).

Sprint 2 (issues #16/#17): interface de provider + integracao com Gemini,
com triagem em lotes por categoria. Sprint 3 (#18/#19): prompts e relatorio
Markdown persistido. Chamado pelo orchestrator depois do Codigo Web (#20).
"""

import asyncio
import logging
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, Finding, ScanJob
from app.services.ai_triage.base import AITriageProvider, TriageResult
from app.services.ai_triage.gemini_provider import GeminiTriageProvider
from app.services.ai_triage.report_builder import generate_report, load_scan_findings

logger = logging.getLogger(__name__)

__all__ = [
    "AITriageProvider",
    "TriageResult",
    "generate_report",
    "get_triage_provider",
    "triage_findings",
]

_UNAVAILABLE = TriageResult(
    verdict=AIVerdict.NEEDS_REVIEW,
    confidence=0.0,
    reasoning="Triagem automatica indisponivel no momento.",
)


def get_triage_provider() -> AITriageProvider:
    if settings.ai_triage_provider != "gemini":
        raise ValueError(
            f"provider de triagem desconhecido: {settings.ai_triage_provider}"
        )
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY nao configurada - preencha o backend/.env")
    return GeminiTriageProvider()


async def triage_findings(db: Session, scan_job: ScanJob) -> None:
    _, pending = await asyncio.to_thread(
        load_scan_findings, db, scan_job, pending_only=True
    )
    if not pending:
        return
    provider = get_triage_provider()

    for batch in _batches(pending):
        try:
            results = await provider.triage_batch(batch)
        except Exception:
            # um lote que a IA nao conseguiu julgar nao pode derrubar o scan inteiro
            logger.exception(
                "falha ao triar o lote %s - marcando como needs_review",
                [f.id for f in batch],
            )
            results = {}
        else:
            if missing := [f.id for f in batch if f.id not in results]:
                logger.warning(
                    "a IA nao devolveu os findings %s - marcando como needs_review",
                    missing,
                )
        for finding in batch:
            _apply_result(finding, results.get(finding.id, _UNAVAILABLE))

    await asyncio.to_thread(db.commit)


def _batches(findings: list[Finding]) -> list[list[Finding]]:
    by_category = defaultdict(list)
    for finding in findings:
        by_category[finding.category].append(finding)
    size = settings.ai_triage_batch_size
    return [
        group[start : start + size]
        for group in by_category.values()
        for start in range(0, len(group), size)
    ]


def _apply_result(finding: Finding, result: TriageResult) -> None:
    finding.ai_verdict = result.verdict
    finding.ai_severity = result.severity
    finding.ai_confidence = result.confidence
    finding.ai_reasoning = result.reasoning
    finding.ai_reproduction_steps = result.reproduction_steps
    finding.ai_remediation = result.remediation
    # O banco usa DateTime sem fuso; preserva o horario UTC nesse formato.
    finding.triaged_at = datetime.now(UTC).replace(tzinfo=None)
