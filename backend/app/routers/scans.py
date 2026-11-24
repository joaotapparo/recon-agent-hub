"""routers/scans.py - consulta de status de scan (RF15, issue #10)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScanEvent, ScanJob
from app.schemas.scan import ScanEventOut, ScanJobOut
from app.services import screenshots

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("/{scan_job_id}", response_model=ScanJobOut)
def get_scan(scan_job_id: int, db: Session = Depends(get_db)):
    scan_job = db.get(ScanJob, scan_job_id)
    if scan_job is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return scan_job


@router.get("/{scan_job_id}/events", response_model=list[ScanEventOut])
def list_scan_events(
    scan_job_id: int,
    after_id: int = Query(0, ge=0, description="So eventos com id maior que este (polling incremental)"),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Feed ao vivo do scan: o painel faz polling passando o ultimo id que ja recebeu."""
    if db.get(ScanJob, scan_job_id) is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return db.scalars(
        select(ScanEvent)
        .where(ScanEvent.scan_job_id == scan_job_id, ScanEvent.id > after_id)
        .order_by(ScanEvent.id)
        .limit(limit)
    ).all()


@router.get("/{scan_job_id}/screenshots", response_model=list[str])
def list_scan_screenshots(scan_job_id: int, db: Session = Depends(get_db)):
    """Hostnames que tem print da pagina inicial neste scan."""
    if db.get(ScanJob, scan_job_id) is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return screenshots.list_screenshots(scan_job_id)


@router.get("/{scan_job_id}/screenshots/{filename}")
def get_scan_screenshot(scan_job_id: int, filename: str):
    hostname = filename.removesuffix(".jpg")
    path = screenshots.screenshot_path(scan_job_id, hostname) if filename.endswith(".jpg") else None
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
