"""Persist trip member names and add the administrator column.

Revision ID: aa20260930
Revises: 3916084a8827
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "aa20260930"
down_revision: str | Sequence[str] | None = "3916084a8827"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "is_admin" not in {column["name"] for column in inspector.get_columns("users")}:
        op.add_column(
            "users",
            sa.Column(
                "is_admin", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )
    if "trip_members" not in inspector.get_table_names():
        op.create_table(
            "trip_members",
            sa.Column("trip_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.ForeignKeyConstraint(["trip_id"], ["trips.id"]),
            sa.PrimaryKeyConstraint("trip_id", "user_id"),
        )


def downgrade() -> None:
    op.drop_table("trip_members")
    op.drop_column("users", "is_admin")
