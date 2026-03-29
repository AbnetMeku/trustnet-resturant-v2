"""add opening_adjusted to stock snapshots

Revision ID: 8a9f7c3b2d11
Revises: d8e4f2a1b9c0
Create Date: 2026-03-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8a9f7c3b2d11"
down_revision = "d8e4f2a1b9c0"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())

    store_columns = {col["name"] for col in inspector.get_columns("store_stock_snapshots")}
    if "opening_adjusted" not in store_columns:
        op.add_column(
            "store_stock_snapshots",
            sa.Column("opening_adjusted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    station_columns = {col["name"] for col in inspector.get_columns("station_stock_snapshots")}
    if "opening_adjusted" not in station_columns:
        op.add_column(
            "station_stock_snapshots",
            sa.Column("opening_adjusted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())

    store_columns = {col["name"] for col in inspector.get_columns("store_stock_snapshots")}
    if "opening_adjusted" in store_columns:
        op.drop_column("store_stock_snapshots", "opening_adjusted")

    station_columns = {col["name"] for col in inspector.get_columns("station_stock_snapshots")}
    if "opening_adjusted" in station_columns:
        op.drop_column("station_stock_snapshots", "opening_adjusted")
