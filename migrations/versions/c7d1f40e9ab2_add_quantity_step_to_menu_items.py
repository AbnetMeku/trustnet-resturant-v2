"""add quantity_step controls for categories and menu items

Revision ID: c7d1f40e9ab2
Revises: 50cea51bf487
Create Date: 2026-02-22 01:15:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c7d1f40e9ab2"
down_revision = "50cea51bf487"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    menu_columns = {col["name"] for col in inspector.get_columns("menu_items")}
    category_columns = {col["name"] for col in inspector.get_columns("categories")}

    if "quantity_step" not in category_columns:
        op.add_column(
            "categories",
            sa.Column(
                "quantity_step",
                sa.Numeric(precision=3, scale=2),
                nullable=False,
                server_default="1.0",
            ),
        )
    # Ensure no nulls remain and remove server default after backfill.
    op.execute("UPDATE categories SET quantity_step = 1.0 WHERE quantity_step IS NULL")
    op.alter_column("categories", "quantity_step", server_default=None)

    if "quantity_step" not in menu_columns:
        op.add_column(
            "menu_items",
            sa.Column(
                "quantity_step",
                sa.Numeric(precision=3, scale=2),
                nullable=True,
            ),
        )
    else:
        # Older rollout may have added this as NOT NULL default 1.0.
        op.alter_column("menu_items", "quantity_step", nullable=True, server_default=None)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    menu_columns = {col["name"] for col in inspector.get_columns("menu_items")}
    category_columns = {col["name"] for col in inspector.get_columns("categories")}

    if "quantity_step" in menu_columns:
        op.drop_column("menu_items", "quantity_step")
    if "quantity_step" in category_columns:
        op.drop_column("categories", "quantity_step")
