"""Persist display names for guests with signed trip-scoped sessions.

Revision ID: 20261029_trip_guests
Revises: 20261029_schema_parity
"""

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "20261029_trip_guests"
down_revision: str | None = "20261029_schema_parity"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "trip_guests",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), primary_key=True),
        sa.Column("trip_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"]),
    )
    op.create_index("ix_trip_guests_trip_id", "trip_guests", ["trip_id"])


def downgrade() -> None:
    op.drop_index("ix_trip_guests_trip_id", table_name="trip_guests")
    op.drop_table("trip_guests")
