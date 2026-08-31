from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.finding import Finding
    from app.models.scan_job import ScanJob


class Subdomain(Base):
    __tablename__ = "subdomains"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_job_id: Mapped[int] = mapped_column(ForeignKey("scan_jobs.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)

    hostname: Mapped[str] = mapped_column(String(255), index=True)
    ip_addresses: Mapped[list | None] = mapped_column(JSON)
    http_status: Mapped[int | None] = mapped_column(Integer)
    http_title: Mapped[str | None] = mapped_column(String(512))
    tech_stack: Mapped[list | None] = mapped_column(JSON)
    open_ports: Mapped[list | None] = mapped_column(JSON)
    takeover_candidate: Mapped[bool] = mapped_column(Boolean, default=False)
    takeover_fingerprint: Mapped[str | None] = mapped_column(String(255))

    scan_job: Mapped["ScanJob"] = relationship(back_populates="subdomains")
    findings: Mapped[list["Finding"]] = relationship(back_populates="subdomain")
