"""add inventory serving defaults

Revision ID: c2f4b7e9d1a3
Revises: a1e4d6f8b9c2
Create Date: 2026-03-02 11:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2f4b7e9d1a3"
down_revision = "a1e4d6f8b9c2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("inventory_items")}

    if "serving_unit" not in columns:
        op.add_column(
            "inventory_items",
            sa.Column("serving_unit", sa.String(length=50), nullable=True, server_default="unit"),
        )

    if "servings_per_unit" not in columns:
        op.add_column(
            "inventory_items",
            sa.Column("servings_per_unit", sa.Float(), nullable=True, server_default="1.0"),
        )

    op.execute("UPDATE inventory_items SET serving_unit = 'unit' WHERE serving_unit IS NULL OR serving_unit = ''")
    op.execute(
        "UPDATE inventory_items SET servings_per_unit = 1.0 WHERE servings_per_unit IS NULL OR servings_per_unit <= 0"
    )

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.alter_column("serving_unit", existing_type=sa.String(length=50), nullable=False)
        batch_op.alter_column("servings_per_unit", existing_type=sa.Float(), nullable=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("inventory_items")}

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        if "servings_per_unit" in columns:
            batch_op.drop_column("servings_per_unit")
        if "serving_unit" in columns:
            batch_op.drop_column("serving_unit")
