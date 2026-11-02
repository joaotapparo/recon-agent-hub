"""routers/scans.py - consulta de status de scan (RF15, issue #10)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScanJob
from app.schemas.scan import ScanJobOut

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("/{scan_job_id}", response_model=ScanJobOut)
def get_scan(scan_job_id: int, db: Session = Depends(get_db)):
    scan_job = db.get(ScanJob, scan_job_id)
    if scan_job is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return scan_job
