"""
routers/domains.py - submissao de dominios e consulta (RF01, RF16, issues #9, #10).

Nenhum scan e criado para dominio sem posse provada por DNS
(services/domain_verification.py), exceto os alvos publicos de teste.
"""

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.domain_validation import InvalidDomainFormatError, assert_valid_domain_format
from app.core.ssrf_guard import UnsafeDomainError, assert_domain_is_public
from app.database import get_db
from app.models import Domain, ScanJob
from app.schemas.domain import (
    DomainOut,
    DomainSubmit,
    DomainSubmitResponse,
    VerificationChallengeOut,
)
from app.services import domain_verification
from app.workers.job_runner import enqueue

router = APIRouter(prefix="/api/domains", tags=["domains"])


@router.post("", response_model=DomainSubmitResponse, status_code=201)
def submit_domain(payload: DomainSubmit, response: Response, db: Session = Depends(get_db)):
    if not payload.authorization_confirmed:
        raise HTTPException(
            status_code=400,
            detail="Confirme que voce tem autorizacao para testar este dominio.",
        )

    try:
        assert_valid_domain_format(payload.name)
        assert_domain_is_public(payload.name)
    except (InvalidDomainFormatError, UnsafeDomainError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    domain = db.query(Domain).filter(Domain.name == payload.name).first()
    if domain is None:
        domain = Domain(name=payload.name)
        db.add(domain)
        db.flush()  # precisa do id antes de criar o ScanJob

    if not domain_verification.is_verified(domain):
        challenge = domain_verification.challenge_for(domain)
        db.commit()
        response.status_code = 202
        return DomainSubmitResponse(
            domain_id=domain.id, verification=VerificationChallengeOut(**asdict(challenge))
        )

    _authorize(domain)
    return DomainSubmitResponse(domain_id=domain.id, scan_job_id=_start_scan(db, domain))


@router.post("/{domain_id}/verify", response_model=DomainSubmitResponse, status_code=201)
def verify_domain(domain_id: int, db: Session = Depends(get_db)):
    """Confere o registro TXT e, se bater, ja dispara o primeiro scan."""
    domain = _get_or_404(db, domain_id)
    try:
        domain_verification.verify(domain)
    except domain_verification.VerificationFailed as exc:
        db.commit()  # guarda o token gerado, se for a primeira vez
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DomainSubmitResponse(domain_id=domain.id, scan_job_id=_start_scan(db, domain))


@router.get("", response_model=list[DomainOut])
def list_domains(db: Session = Depends(get_db)):
    domains = db.query(Domain).order_by(Domain.created_at.desc()).all()
    return [_to_domain_out(d) for d in domains]


@router.get("/{domain_id}", response_model=DomainOut)
def get_domain(domain_id: int, db: Session = Depends(get_db)):
    return _to_domain_out(_get_or_404(db, domain_id))


@router.post("/{domain_id}/rescan", response_model=DomainSubmitResponse, status_code=201)
def rescan_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = _get_or_404(db, domain_id)
    if not domain_verification.is_verified(domain):
        # verificacao vencida: confere o TXT de novo antes de recusar
        try:
            domain_verification.verify(domain)
        except domain_verification.VerificationFailed as exc:
            db.commit()
            raise HTTPException(
                status_code=400, detail=f"Verificação do domínio pendente ou vencida. {exc}"
            ) from exc
    _authorize(domain)
    return DomainSubmitResponse(domain_id=domain.id, scan_job_id=_start_scan(db, domain))


def _get_or_404(db: Session, domain_id: int) -> Domain:
    domain = db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    return domain


def _authorize(domain: Domain) -> None:
    if not domain.authorized:
        domain.authorized = True
        domain.authorized_at = datetime.utcnow()


def _start_scan(db: Session, domain: Domain) -> int:
    scan_job = ScanJob(domain_id=domain.id)
    db.add(scan_job)
    db.commit()
    db.refresh(scan_job)
    enqueue(scan_job.id)
    return scan_job.id


def _to_domain_out(domain: Domain) -> DomainOut:
    latest = max(domain.scan_jobs, key=lambda j: j.created_at, default=None)
    verified = domain_verification.is_verified(domain)
    challenge = None
    if not verified and domain.verification_token:
        challenge = VerificationChallengeOut(**asdict(domain_verification.challenge_for(domain)))
    return DomainOut(
        id=domain.id,
        name=domain.name,
        authorized=domain.authorized,
        authorized_at=domain.authorized_at,
        verified=verified,
        verified_at=domain.verified_at,
        verification=challenge,
        created_at=domain.created_at,
        latest_scan_id=latest.id if latest else None,
        latest_scan_status=latest.status if latest else None,
    )
