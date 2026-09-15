"""
routers/domains.py - submissao de dominios e consulta (RF01, RF16, issues #9, #10).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.ssrf_guard import UnsafeDomainError, assert_domain_is_public
from app.database import get_db
from app.models import Domain, ScanJob
from app.schemas.domain import DomainOut, DomainSubmit, DomainSubmitResponse
from app.workers.job_runner import enqueue

router = APIRouter(prefix="/api/domains", tags=["domains"])


@router.post("", response_model=DomainSubmitResponse, status_code=201)
def submit_domain(payload: DomainSubmit, db: Session = Depends(get_db)):
    if not payload.authorization_confirmed:
        raise HTTPException(
            status_code=400,
            detail="Confirme que voce tem autorizacao para testar este dominio.",
        )

    try:
        assert_domain_is_public(payload.name)
    except UnsafeDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    domain = db.query(Domain).filter(Domain.name == payload.name).first()
    if domain is None:
        domain = Domain(name=payload.name, authorized=True, authorized_at=datetime.utcnow())
        db.add(domain)
        db.commit()
        db.refresh(domain)
    elif not domain.authorized:
        domain.authorized = True
        domain.authorized_at = datetime.utcnow()
        db.commit()

    scan_job = ScanJob(domain_id=domain.id)
    db.add(scan_job)
    db.commit()
    db.refresh(scan_job)

    enqueue(scan_job.id)

    return DomainSubmitResponse(domain_id=domain.id, scan_job_id=scan_job.id)


@router.get("", response_model=list[DomainOut])
def list_domains(db: Session = Depends(get_db)):
    domains = db.query(Domain).order_by(Domain.created_at.desc()).all()
    return [_to_domain_out(d) for d in domains]


@router.get("/{domain_id}", response_model=DomainOut)
def get_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    return _to_domain_out(domain)


@router.post("/{domain_id}/rescan", response_model=DomainSubmitResponse, status_code=201)
def rescan_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    if not domain.authorized:
        raise HTTPException(status_code=400, detail="Dominio nao autorizado para rescan.")

    scan_job = ScanJob(domain_id=domain.id)
    db.add(scan_job)
    db.commit()
    db.refresh(scan_job)

    enqueue(scan_job.id)

    return DomainSubmitResponse(domain_id=domain.id, scan_job_id=scan_job.id)


def _to_domain_out(domain: Domain) -> DomainOut:
    latest = max(domain.scan_jobs, key=lambda j: j.created_at, default=None)
    return DomainOut(
        id=domain.id,
        name=domain.name,
        authorized=domain.authorized,
        authorized_at=domain.authorized_at,
        created_at=domain.created_at,
        latest_scan_status=latest.status if latest else None,
    )
