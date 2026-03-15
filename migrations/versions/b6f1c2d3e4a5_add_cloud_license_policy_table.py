"""add cloud license policy table

Revision ID: b6f1c2d3e4a5
Revises: f2a1c6d7e8f9
Create Date: 2026-03-15 21:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b6f1c2d3e4a5"
down_revision = "f2a1c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cloud_license_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("validation_interval_days", sa.Integer(), nullable=False),
        sa.Column("grace_period_days", sa.Integer(), nullable=False),
        sa.Column("lock_mode", sa.String(length=20), nullable=False),
        sa.Column("last_fetched_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("cloud_license_policy")
