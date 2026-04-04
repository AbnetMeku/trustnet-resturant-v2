"""add waiter shift close toggle to branding

Revision ID: aa9b7c6d5e43
Revises: 8a9f7c3b2d11
Create Date: 2026-04-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "aa9b7c6d5e43"
down_revision = "8a9f7c3b2d11"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "waiter_shift_close_enabled" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("waiter_shift_close_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "waiter_shift_close_enabled" in columns:
        op.drop_column("branding_settings", "waiter_shift_close_enabled")
