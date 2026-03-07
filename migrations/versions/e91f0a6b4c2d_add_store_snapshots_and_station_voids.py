"""add store snapshots and station void tracking

Revision ID: e91f0a6b4c2d
Revises: 9a6c4d1e2b7f
Create Date: 2026-03-07 20:35:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "e91f0a6b4c2d"
down_revision = "9a6c4d1e2b7f"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    station_snapshot_columns = {
        column["name"] for column in inspector.get_columns("station_stock_snapshots")
    }
    if "void_quantity" not in station_snapshot_columns:
        op.add_column(
            "station_stock_snapshots",
            sa.Column("void_quantity", sa.Float(), nullable=False, server_default="0"),
        )
        op.execute("UPDATE station_stock_snapshots SET void_quantity = 0 WHERE void_quantity IS NULL")
        op.alter_column("station_stock_snapshots", "void_quantity", server_default=None)

    tables = set(inspector.get_table_names())
    if "store_stock_snapshots" not in tables:
        op.create_table(
            "store_stock_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("inventory_item_id", sa.Integer(), sa.ForeignKey("inventory_items.id"), nullable=False),
            sa.Column("snapshot_date", sa.Date(), nullable=False),
            sa.Column("opening_quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("purchased_quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("transferred_out_quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("closing_quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("inventory_item_id", "snapshot_date", name="uq_store_item_date"),
        )
        op.alter_column("store_stock_snapshots", "opening_quantity", server_default=None)
        op.alter_column("store_stock_snapshots", "purchased_quantity", server_default=None)
        op.alter_column("store_stock_snapshots", "transferred_out_quantity", server_default=None)
        op.alter_column("store_stock_snapshots", "closing_quantity", server_default=None)


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "store_stock_snapshots" in tables:
        op.drop_table("store_stock_snapshots")

    station_snapshot_columns = {
        column["name"] for column in inspector.get_columns("station_stock_snapshots")
    }
    if "void_quantity" in station_snapshot_columns:
        op.drop_column("station_stock_snapshots", "void_quantity")
