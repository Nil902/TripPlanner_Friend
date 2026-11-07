"""Bring migrated databases in line with the existing application models.

Revision ID: 20261029_schema_parity
Revises: 3916084a8827
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20261029_schema_parity"
down_revision: str | None = "3916084a8827"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE tripstatus ADD VALUE IF NOT EXISTS 'FLAGGED'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed without rebuilding the type and
    # potentially destroying existing flagged records. Preserve that value.
    op.drop_column("users", "is_admin")
