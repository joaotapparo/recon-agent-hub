import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.domain import Domain
    from app.models.finding import Finding
    from app.models.report import Report
    from app.models.subdomain import Subdomain


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    ENUMERATING = "enumerating"
    PROBING = "probing"
    PORT_SCANNING = "port_scanning"
    CHECKING_TAKEOVER = "checking_takeover"
    SCANNING_JS = "scanning_js"
    TRIAGING = "triaging"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)
    status: Mapped[ScanStatus] = mapped_column(Enum(ScanStatus), default=ScanStatus.PENDING, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_message: Mapped[str | None] = mapped_column(Text)
    artifacts_path: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    domain: Mapped["Domain"] = relationship(back_populates="scan_jobs")
    subdomains: Mapped[list["Subdomain"]] = relationship(back_populates="scan_job", cascade="all, delete-orphan")
    findings: Mapped[list["Finding"]] = relationship(back_populates="scan_job", cascade="all, delete-orphan")
    report: Mapped["Report | None"] = relationship(back_populates="scan_job", cascade="all, delete-orphan")
