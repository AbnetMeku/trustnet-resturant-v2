"""add inventory shot serving rules

Revision ID: 7f1b8a2c9d4e
Revises: b5d9a7c3e2f1
Create Date: 2026-03-07 10:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "7f1b8a2c9d4e"
down_revision = "b5d9a7c3e2f1"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    inventory_columns = {c["name"] for c in inspector.get_columns("inventory_items")}
    link_columns = {c["name"] for c in inspector.get_columns("inventory_menu_links")}

    if "container_size_ml" not in inventory_columns:
        op.add_column(
            "inventory_items",
            sa.Column("container_size_ml", sa.Float(), nullable=True, server_default="1.0"),
        )

    if "default_shot_ml" not in inventory_columns:
        op.add_column(
            "inventory_items",
            sa.Column("default_shot_ml", sa.Float(), nullable=True, server_default="1.0"),
        )

    if "serving_type" not in link_columns:
        op.add_column(
            "inventory_menu_links",
            sa.Column("serving_type", sa.String(length=20), nullable=True, server_default="custom_ml"),
        )

    if "serving_value" not in link_columns:
        op.add_column(
            "inventory_menu_links",
            sa.Column("serving_value", sa.Float(), nullable=True, server_default="1.0"),
        )

    op.execute(
        "UPDATE inventory_items "
        "SET container_size_ml = CASE "
        "WHEN COALESCE(servings_per_unit, 0) > 0 THEN servings_per_unit "
        "ELSE 1.0 END "
        "WHERE container_size_ml IS NULL OR container_size_ml <= 0"
    )
    op.execute(
        "UPDATE inventory_items "
        "SET default_shot_ml = 1.0 "
        "WHERE default_shot_ml IS NULL OR default_shot_ml <= 0"
    )
    op.execute(
        "UPDATE inventory_menu_links "
        "SET serving_type = 'custom_ml' "
        "WHERE serving_type IS NULL OR serving_type = ''"
    )
    op.execute(
        "UPDATE inventory_menu_links l "
        "SET serving_value = CASE "
        "WHEN COALESCE(l.deduction_ratio, 0) > 0 THEN "
        "l.deduction_ratio * COALESCE(i.container_size_ml, 1.0) "
        "ELSE 1.0 END "
        "FROM inventory_items i "
        "WHERE l.inventory_item_id = i.id AND (l.serving_value IS NULL OR l.serving_value <= 0)"
    )

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.alter_column("container_size_ml", existing_type=sa.Float(), nullable=False)
        batch_op.alter_column("default_shot_ml", existing_type=sa.Float(), nullable=False)

    with op.batch_alter_table("inventory_menu_links", schema=None) as batch_op:
        batch_op.alter_column("serving_type", existing_type=sa.String(length=20), nullable=False)
        batch_op.alter_column("serving_value", existing_type=sa.Float(), nullable=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    inventory_columns = {c["name"] for c in inspector.get_columns("inventory_items")}
    link_columns = {c["name"] for c in inspector.get_columns("inventory_menu_links")}

    with op.batch_alter_table("inventory_menu_links", schema=None) as batch_op:
        if "serving_value" in link_columns:
            batch_op.drop_column("serving_value")
        if "serving_type" in link_columns:
            batch_op.drop_column("serving_type")

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        if "default_shot_ml" in inventory_columns:
            batch_op.drop_column("default_shot_ml")
        if "container_size_ml" in inventory_columns:
            batch_op.drop_column("container_size_ml")
