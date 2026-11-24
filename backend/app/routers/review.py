"""
routers/review.py - revisao humana dos achados.

A IA sugere, o profissional decide: ele pode confirmar ou descartar qualquer
achado (inclusive um que a IA chamou de falso positivo) e ajustar a
severidade. A sugestao da IA fica guardada nos campos ai_*; a decisao humana
vai em human_* e prevalece no painel e no relatorio, que e remontado na hora.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AIVerdict, Finding, ScanJob
from app.schemas.scan import FindingDetailOut, ReviewIn
from app.services.ai_triage.report_builder import rebuild_report

router = APIRouter(prefix="/api/findings", tags=["review"])

_ALLOWED = {AIVerdict.TRUE_POSITIVE, AIVerdict.FALSE_POSITIVE}


@router.put("/{finding_id}/review", response_model=FindingDetailOut)
def review_finding(finding_id: int, payload: ReviewIn, db: Session = Depends(get_db)):
    finding = _get_or_404(db, finding_id)
    if payload.verdict not in _ALLOWED:
        raise HTTPException(
            status_code=400,
            detail="Na revisão, o achado deve ser confirmado (true_positive) ou descartado (false_positive).",
        )

    severity = None
    if payload.verdict == AIVerdict.TRUE_POSITIVE:
        # sem severidade informada, aproveita a que a IA estimou
        severity = payload.severity or finding.ai_severity
        if severity is None:
            raise HTTPException(
                status_code=400, detail="Informe a severidade para confirmar o achado."
            )

    finding.human_verdict = payload.verdict
    finding.human_severity = severity
    finding.human_note = (payload.note or "").strip() or None
    finding.reviewed_at = datetime.utcnow()
    db.commit()
    _refresh_report(db, finding)
    db.refresh(finding)
    return finding


@router.delete("/{finding_id}/review", response_model=FindingDetailOut)
def undo_review(finding_id: int, db: Session = Depends(get_db)):
    """Desfaz a revisao: o achado volta a seguir a sugestao da IA."""
    finding = _get_or_404(db, finding_id)
    finding.human_verdict = None
    finding.human_severity = None
    finding.human_note = None
    finding.reviewed_at = None
    db.commit()
    _refresh_report(db, finding)
    db.refresh(finding)
    return finding


def _get_or_404(db: Session, finding_id: int) -> Finding:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


def _refresh_report(db: Session, finding: Finding) -> None:
    scan_job = db.get(ScanJob, finding.scan_job_id)
    if scan_job is not None:
        # sem relatorio ainda (scan rodando), o orchestrator ja vai usar a revisao
        rebuild_report(db, scan_job)
