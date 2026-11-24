"""scan_events: feed ao vivo do pipeline

Revision ID: b7e2c91d4f10
Revises: a628cb408ee0
Create Date: 2026-11-11

A nova etapa WEB_AUDIT do ScanStatus nao precisa de migracao: no SQLite o
Enum vira VARCHAR sem CHECK constraint.
"""

import sqlalchemy as sa

from alembic import op

revision = "b7e2c91d4f10"
down_revision = "a628cb408ee0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scan_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_job_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.Enum("INFO", "FOUND", "WARN", "ALERT", name="eventkind"), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["scan_job_id"], ["scan_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scan_events_scan_job_id"), "scan_events", ["scan_job_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scan_events_scan_job_id"), table_name="scan_events")
    op.drop_table("scan_events")
