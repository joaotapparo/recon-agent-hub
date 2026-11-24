"""revisao humana dos achados e resumo da IA guardado a parte

Revision ID: e5f1a8c0b934
Revises: d4e9b6f8a312
Create Date: 2026-11-24
"""

import sqlalchemy as sa

from alembic import op

revision = "e5f1a8c0b934"
down_revision = "d4e9b6f8a312"
branch_labels = None
depends_on = None

_VERDICTS = ("PENDING", "TRUE_POSITIVE", "FALSE_POSITIVE", "NEEDS_REVIEW")
_SEVERITIES = ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")


def upgrade() -> None:
    with op.batch_alter_table("findings") as batch:
        batch.add_column(sa.Column("human_verdict", sa.Enum(*_VERDICTS, name="aiverdict", native_enum=False, create_constraint=False), nullable=True))
        batch.add_column(sa.Column("human_severity", sa.Enum(*_SEVERITIES, name="severity", native_enum=False, create_constraint=False), nullable=True))
        batch.add_column(sa.Column("human_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("ai_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch:
        batch.drop_column("ai_summary")
    with op.batch_alter_table("findings") as batch:
        batch.drop_column("reviewed_at")
        batch.drop_column("human_note")
        batch.drop_column("human_severity")
        batch.drop_column("human_verdict")
