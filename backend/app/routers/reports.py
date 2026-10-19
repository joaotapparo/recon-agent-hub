"""routers/reports.py - relatorio Markdown de um scan (RF13, issue #21)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Report, ScanJob
from app.schemas.scan import ReportOut

router = APIRouter(prefix="/api/scans", tags=["reports"])


@router.get("/{scan_job_id}/report", response_model=ReportOut)
def get_report(scan_job_id: int, db: Session = Depends(get_db)):
    return _load(db, scan_job_id)


@router.get("/{scan_job_id}/report.md", response_class=PlainTextResponse)
def get_report_markdown(scan_job_id: int, db: Session = Depends(get_db)):
    report = _load(db, scan_job_id)
    return PlainTextResponse(
        report.markdown_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="relatorio-scan-{scan_job_id}.md"'},
    )


def _load(db: Session, scan_job_id: int) -> Report:
    if db.get(ScanJob, scan_job_id) is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    report = db.query(Report).filter(Report.scan_job_id == scan_job_id).one_or_none()
    if report is None:
        # scan ainda rodando, ou falhou antes da etapa de triagem
        raise HTTPException(status_code=404, detail="Relatorio ainda nao gerado para este scan")
    return report
