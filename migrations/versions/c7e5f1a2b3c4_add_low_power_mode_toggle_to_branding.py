"""add low power mode toggle to branding settings

Revision ID: c7e5f1a2b3c4
Revises: b6f1c2d3e4a5
Create Date: 2026-03-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c7e5f1a2b3c4"
down_revision = "b6f1c2d3e4a5"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "low_power_mode_enabled" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("low_power_mode_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    op.execute(
        "UPDATE branding_settings "
        "SET low_power_mode_enabled = TRUE "
        "WHERE low_power_mode_enabled IS NULL"
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "low_power_mode_enabled" in columns:
        op.drop_column("branding_settings", "low_power_mode_enabled")
