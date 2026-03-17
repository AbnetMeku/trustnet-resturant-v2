"""add full replace marker to cloud sync state

Revision ID: c1d2e3f4a5b6
Revises: b6f1c2d3e4a5
Create Date: 2026-03-15 22:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _column_exists(table_name, column_name):
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    return column_name in columns


# revision identifiers, used by Alembic.
revision = "c1d2e3f4a5b6"
down_revision = "b6f1c2d3e4a5"
branch_labels = None
depends_on = None


def upgrade():
    if not _column_exists("cloud_sync_state", "last_full_replace_at"):
        op.add_column("cloud_sync_state", sa.Column("last_full_replace_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("cloud_sync_state", "last_full_replace_at")
