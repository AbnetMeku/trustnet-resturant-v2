"""add print preview toggle to branding settings

Revision ID: f7b2a5e1c931
Revises: e2c4a9b7f6d1
Create Date: 2026-03-01 12:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f7b2a5e1c931"
down_revision = "e2c4a9b7f6d1"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "print_preview_enabled" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("print_preview_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    op.execute(
        "UPDATE branding_settings "
        "SET print_preview_enabled = FALSE "
        "WHERE print_preview_enabled IS NULL"
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "print_preview_enabled" in columns:
        op.drop_column("branding_settings", "print_preview_enabled")
