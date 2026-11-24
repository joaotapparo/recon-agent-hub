"""domains: verificacao de posse por DNS

Revision ID: c3d8a5e7f201
Revises: b7e2c91d4f10
Create Date: 2026-11-11
"""

import sqlalchemy as sa

from alembic import op

revision = "c3d8a5e7f201"
down_revision = "b7e2c91d4f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("domains") as batch:
        batch.add_column(sa.Column("verification_token", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("verified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("domains") as batch:
        batch.drop_column("verified_at")
        batch.drop_column("verification_token")
