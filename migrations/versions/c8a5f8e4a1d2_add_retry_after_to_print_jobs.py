"""add retry_after to print jobs

Revision ID: c8a5f8e4a1d2
Revises: 8f1a9d2c4b7e
Create Date: 2026-02-28 13:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c8a5f8e4a1d2"
down_revision = "8f1a9d2c4b7e"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("print_jobs")}
    if "retry_after" not in columns:
        op.add_column("print_jobs", sa.Column("retry_after", sa.DateTime(), nullable=True))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("print_jobs")}
    if "retry_after" in columns:
        op.drop_column("print_jobs", "retry_after")
