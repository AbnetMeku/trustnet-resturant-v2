"""
Revision ID: c1a2b3c4d5e6
Revises: f2a1c6d7e8f9
Create Date: 2026-03-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _table_exists(table_name):
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name)


# revision identifiers, used by Alembic.
revision = "c1a2b3c4d5e6"
down_revision = "f2a1c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade():
    if not _table_exists("cloud_sync_id_map"):
        op.create_table(
            "cloud_sync_id_map",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("entity_type", sa.String(length=64), nullable=False),
            sa.Column("cloud_id", sa.String(length=64), nullable=False),
            sa.Column("local_id", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("entity_type", "cloud_id", name="uq_cloud_sync_id_map"),
        )


def downgrade():
    op.drop_table("cloud_sync_id_map")
