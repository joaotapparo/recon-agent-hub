import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventKind(str, enum.Enum):
    INFO = "info"  # o que o scan esta fazendo agora
    FOUND = "found"  # algo foi descoberto (subdominio, porta, arquivo JS)
    WARN = "warn"  # possivel problema
    ALERT = "alert"  # problema serio


class ScanEvent(Base):
    """Linha do feed ao vivo do painel. So narra o pipeline; os dados de verdade ficam em Finding/Subdomain."""

    __tablename__ = "scan_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_job_id: Mapped[int] = mapped_column(ForeignKey("scan_jobs.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(32))
    kind: Mapped[EventKind] = mapped_column(Enum(EventKind), default=EventKind.INFO)
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
