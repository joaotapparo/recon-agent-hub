"""
Servico Agente de IA (RF10, RF11, RF12, RF17).

Sprint 2 (issues #16/#17): interface de provider + integracao inicial com
Gemini. O prompt ainda e simples e o relatorio (Report, RF13) fica pro Sprint
3 (#18/#19). A integracao no orchestrator e a issue #20 (Sprint 4) - hoje esse
modulo so e exercitado por teste.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIVerdict, Finding, ScanJob
from app.services.ai_triage.base import AITriageProvider, TriageResult
from app.services.ai_triage.gemini_provider import GeminiTriageProvider

logger = logging.getLogger(__name__)

__all__ = ["AITriageProvider", "TriageResult", "get_triage_provider", "triage_findings"]


def get_triage_provider() -> AITriageProvider:
    if settings.ai_triage_provider != "gemini":
        raise ValueError(f"provider de triagem desconhecido: {settings.ai_triage_provider}")
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY nao configurada - preencha o backend/.env")
    return GeminiTriageProvider()


async def triage_findings(db: Session, scan_job: ScanJob) -> None:
    provider = get_triage_provider()

    pending = (
        db.query(Finding)
        .filter(Finding.scan_job_id == scan_job.id, Finding.ai_verdict == AIVerdict.PENDING)
        .all()
    )

    for finding in pending:
        try:
            result = await provider.triage(finding)
        except Exception:
            # um finding que a IA nao conseguiu julgar nao pode derrubar o scan inteiro
            logger.exception("falha ao triar finding %s - marcando como needs_review", finding.id)
            result = TriageResult(
                verdict=AIVerdict.NEEDS_REVIEW,
                confidence=0.0,
                reasoning="Triagem automatica indisponivel no momento.",
            )
        _apply_result(finding, result)

    db.commit()


def _apply_result(finding: Finding, result: TriageResult) -> None:
    finding.ai_verdict = result.verdict
    finding.ai_severity = result.severity
    finding.ai_confidence = result.confidence
    finding.ai_reasoning = result.reasoning
    finding.ai_reproduction_steps = result.reproduction_steps
    finding.ai_remediation = result.remediation
    # O banco usa DateTime sem fuso; preserva o horario UTC nesse formato.
    finding.triaged_at = datetime.now(UTC).replace(tzinfo=None)
