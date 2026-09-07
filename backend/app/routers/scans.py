"""
Router minimo para disparar e acompanhar um scan (RF01, RF15, RF16).

Feito so o suficiente pra exercitar o modulo de Infraestrutura ponta a
ponta pela API. A pessoa dona do modulo Painel + Integracao deve revisar
e expandir conforme a necessidade do frontend (paginacao, filtros, etc.).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Domain, ScanJob
from app.schemas.scan import ScanJobOut, ScanSubmit
from app.workers.pipeline import run_scan_job

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("", response_model=ScanJobOut, status_code=201)
def create_scan(payload: ScanSubmit, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not payload.authorized:
        raise HTTPException(
            status_code=400,
            detail="Confirme que voce tem autorizacao para testar este dominio.",
        )

    domain = db.query(Domain).filter(Domain.name == payload.domain).first()
    if domain is None:
        domain = Domain(name=payload.domain, authorized=True)
        db.add(domain)
        db.commit()
        db.refresh(domain)
    elif not domain.authorized:
        domain.authorized = True
        db.commit()

    scan_job = ScanJob(domain_id=domain.id)
    db.add(scan_job)
    db.commit()
    db.refresh(scan_job)

    background_tasks.add_task(run_scan_job, scan_job.id)

    return scan_job


@router.get("/{scan_job_id}", response_model=ScanJobOut)
def get_scan(scan_job_id: int, db: Session = Depends(get_db)):
    scan_job = db.get(ScanJob, scan_job_id)
    if scan_job is None:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return scan_job


@router.get("", response_model=list[ScanJobOut])
def list_scans(db: Session = Depends(get_db)):
    return db.query(ScanJob).order_by(ScanJob.created_at.desc()).all()
