"""add kds mark unavailable toggle to branding settings

Revision ID: b5d9a7c3e2f1
Revises: c2f4b7e9d1a3
Create Date: 2026-03-05 02:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b5d9a7c3e2f1"
down_revision = "c2f4b7e9d1a3"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "kds_mark_unavailable_enabled" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("kds_mark_unavailable_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    op.execute(
        "UPDATE branding_settings "
        "SET kds_mark_unavailable_enabled = FALSE "
        "WHERE kds_mark_unavailable_enabled IS NULL"
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "kds_mark_unavailable_enabled" in columns:
        op.drop_column("branding_settings", "kds_mark_unavailable_enabled")
