from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import AIVerdict, FindingCategory, ScanStatus, Severity


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

    id: int
    subdomain_id: int | None = None
    category: FindingCategory
    source_tool: str
    title: str
    target: str
    ai_verdict: AIVerdict
    ai_severity: Severity | None = None
    ai_reasoning: str | None = None
    ai_reproduction_steps: str | None = None


class FindingDetailOut(FindingOut):
    """GET /api/scans/{id}/findings - inclui a evidencia (secrets ja vem mascarados do js_scanner)."""

    raw_evidence: dict | str | list | None = None
    ai_confidence: float | None = None
    ai_remediation: str | None = None
    created_at: datetime
    triaged_at: datetime | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scan_job_id: int
    domain_id: int
    summary: str | None = None
    markdown_content: str
    ai_model_used: str
    generated_at: datetime


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
