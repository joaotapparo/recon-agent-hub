"""subdomains: firewall de aplicacao detectado (Auditoria Web)

Revision ID: d4e9b6f8a312
Revises: c3d8a5e7f201
Create Date: 2026-11-11

As categorias novas de Finding (vulnerable_component, credential_leak) nao
precisam de migracao: no SQLite o Enum vira VARCHAR sem CHECK constraint.
"""

import sqlalchemy as sa

from alembic import op

revision = "d4e9b6f8a312"
down_revision = "c3d8a5e7f201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("subdomains") as batch:
        batch.add_column(sa.Column("waf", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("subdomains") as batch:
        batch.drop_column("waf")
