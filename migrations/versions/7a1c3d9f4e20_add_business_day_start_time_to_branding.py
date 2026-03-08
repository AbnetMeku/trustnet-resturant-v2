"""add business day start time to branding settings

Revision ID: 7a1c3d9f4e20
Revises: 2f6b3fd1a77e
Create Date: 2026-02-26 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7a1c3d9f4e20"
down_revision = "2f6b3fd1a77e"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}

    if "business_day_start_time" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column(
                "business_day_start_time",
                sa.String(length=5),
                nullable=False,
                server_default="06:00",
            ),
        )

    # Ensure existing rows have a valid value.
    op.execute(
        "UPDATE branding_settings SET business_day_start_time = '06:00' "
        "WHERE business_day_start_time IS NULL OR business_day_start_time = ''"
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "business_day_start_time" in columns:
        op.drop_column("branding_settings", "business_day_start_time")
