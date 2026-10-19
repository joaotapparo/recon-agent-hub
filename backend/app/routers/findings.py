"""routers/findings.py - achados de um scan, com filtros (RF14, issue #15)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AIVerdict, Finding, FindingCategory, ScanJob, Severity
from app.schemas.scan import FindingDetailOut

router = APIRouter(prefix="/api/scans", tags=["findings"])


@router.get("/{scan_job_id}/findings", response_model=list[FindingDetailOut])
def list_findings(
    scan_job_id: int,
    category: FindingCategory | None = None,
    severity: Severity | None = None,
    verdict: AIVerdict | None = None,
    db: Session = Depends(get_db),
):
    if db.get(ScanJob, scan_job_id) is None:
        raise HTTPException(status_code=404, detail="Scan job not found")

    query = db.query(Finding).filter(Finding.scan_job_id == scan_job_id)
    if category is not None:
        query = query.filter(Finding.category == category)
    if severity is not None:
        query = query.filter(Finding.ai_severity == severity)
    if verdict is not None:
        query = query.filter(Finding.ai_verdict == verdict)
    return query.order_by(Finding.id).all()
