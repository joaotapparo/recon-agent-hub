import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.scan_job import ScanJob
    from app.models.subdomain import Subdomain


class FindingCategory(str, enum.Enum):
    SUBDOMAIN_TAKEOVER = "subdomain_takeover"
    OPEN_PORT = "open_port"
    EXPOSED_SECRET = "exposed_secret"
    EXPOSED_ENDPOINT = "exposed_endpoint"
    MISCONFIGURATION = "misconfiguration"


class AIVerdict(str, enum.Enum):
    PENDING = "pending"
    TRUE_POSITIVE = "true_positive"
    FALSE_POSITIVE = "false_positive"
    NEEDS_REVIEW = "needs_review"


class Severity(str, enum.Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_job_id: Mapped[int] = mapped_column(ForeignKey("scan_jobs.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)
    subdomain_id: Mapped[int | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"))

    category: Mapped[FindingCategory] = mapped_column(Enum(FindingCategory), index=True)
    source_tool: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    target: Mapped[str] = mapped_column(String(512))
    raw_evidence: Mapped[dict | str | None] = mapped_column(JSON)

    ai_verdict: Mapped[AIVerdict] = mapped_column(Enum(AIVerdict), default=AIVerdict.PENDING, index=True)
    ai_severity: Mapped[Severity | None] = mapped_column(Enum(Severity))
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_reasoning: Mapped[str | None] = mapped_column(Text)
    ai_reproduction_steps: Mapped[str | None] = mapped_column(Text)
    ai_remediation: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime)

    scan_job: Mapped["ScanJob"] = relationship(back_populates="findings")
    subdomain: Mapped["Subdomain | None"] = relationship(back_populates="findings")
