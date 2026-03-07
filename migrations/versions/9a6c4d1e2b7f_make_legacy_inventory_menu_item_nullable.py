"""make legacy inventory menu_item nullable

Revision ID: 9a6c4d1e2b7f
Revises: 7f1b8a2c9d4e
Create Date: 2026-03-07 12:35:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "9a6c4d1e2b7f"
down_revision = "7f1b8a2c9d4e"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"]: c for c in inspector.get_columns("inventory_items")}

    if "menu_item_id" in columns and not columns["menu_item_id"].get("nullable", True):
        with op.batch_alter_table("inventory_items", schema=None) as batch_op:
            batch_op.alter_column(
                "menu_item_id",
                existing_type=sa.Integer(),
                nullable=True,
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("inventory_items")}

    if "menu_item_id" in columns:
        null_count = bind.execute(sa.text("SELECT COUNT(*) FROM inventory_items WHERE menu_item_id IS NULL")).scalar()
        if null_count:
            raise RuntimeError(
                "Cannot downgrade: inventory_items contains rows with NULL menu_item_id."
            )
        with op.batch_alter_table("inventory_items", schema=None) as batch_op:
            batch_op.alter_column(
                "menu_item_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
