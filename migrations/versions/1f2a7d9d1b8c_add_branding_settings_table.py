"""add branding settings table

Revision ID: 1f2a7d9d1b8c
Revises: c7d1f40e9ab2
Create Date: 2026-02-22 03:05:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1f2a7d9d1b8c"
down_revision = "c7d1f40e9ab2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "branding_settings" not in tables:
        op.create_table(
            "branding_settings",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("logo_url", sa.Text(), nullable=True),
            sa.Column("background_url", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "branding_settings" in tables:
        op.drop_table("branding_settings")
