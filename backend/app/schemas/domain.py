from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import ScanStatus


class DomainSubmit(BaseModel):
    name: str
    authorization_confirmed: bool


class DomainSubmitResponse(BaseModel):
    domain_id: int
    scan_job_id: int


class DomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    authorized: bool
    authorized_at: datetime | None = None
    created_at: datetime
    latest_scan_status: ScanStatus | None = None
