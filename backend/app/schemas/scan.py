from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import AIVerdict, FindingCategory, ScanStatus, Severity


class ScanSubmit(BaseModel):
    domain: str
    # confirmacao explicita de autorizacao exigida pelo MVP (ver README)
    authorized: bool


class SubdomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hostname: str
    ip_addresses: list | None = None
    http_status: int | None = None
    http_title: str | None = None
    tech_stack: list | None = None
    open_ports: list | None = None
    takeover_candidate: bool
    takeover_fingerprint: str | None = None


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: FindingCategory
    source_tool: str
    title: str
    target: str
    ai_verdict: AIVerdict
    ai_severity: Severity | None = None
    ai_reasoning: str | None = None
    ai_reproduction_steps: str | None = None


class ScanJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ScanStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime
    subdomains: list[SubdomainOut] = []
    findings: list[FindingOut] = []
