from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import ScanStatus


class DomainSubmit(BaseModel):
    name: str
    authorization_confirmed: bool


class VerificationChallengeOut(BaseModel):
    record_name: str
    record_type: str
    record_value: str


class DomainSubmitResponse(BaseModel):
    domain_id: int
    # None quando o dominio ainda precisa provar posse por DNS
    scan_job_id: int | None = None
    verification: VerificationChallengeOut | None = None


class ScanSummaryOut(BaseModel):
    """Uma linha do historico de scans do dominio (comparacao antes/depois)."""

    id: int
    status: ScanStatus
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    subdomains: int
    active_hosts: int
    open_ports: int
    # achados que nao foram descartados como falso positivo
    findings: int
    by_severity: dict[str, int]


class DomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    authorized: bool
    authorized_at: datetime | None = None
    verified: bool
    verified_at: datetime | None = None
    verification: VerificationChallengeOut | None = None
    created_at: datetime
    latest_scan_id: int | None = None
    latest_scan_status: ScanStatus | None = None
