"""add cloud sync tables

Revision ID: f2a1c6d7e8f9
Revises: 8e926fe32e87, a7b8c9d0e1f2
Create Date: 2026-03-08 22:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _table_exists(table_name):
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return inspector.has_table(table_name)


# revision identifiers, used by Alembic.
revision = "f2a1c6d7e8f9"
down_revision = ("8e926fe32e87", "a7b8c9d0e1f2")
branch_labels = None
depends_on = None


def upgrade():
    if not _table_exists("cloud_instance_config"):
        op.create_table(
            "cloud_instance_config",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=True),
            sa.Column("store_id", sa.Integer(), nullable=True),
            sa.Column("device_id", sa.String(length=128), nullable=True),
            sa.Column("device_name", sa.String(length=120), nullable=True),
            sa.Column("machine_fingerprint", sa.String(length=255), nullable=True),
            sa.Column("cloud_base_url", sa.String(length=255), nullable=True),
            sa.Column("license_key", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("cloud_license_state"):
        op.create_table(
            "cloud_license_state",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=True),
            sa.Column("store_id", sa.Integer(), nullable=True),
            sa.Column("device_id", sa.String(length=128), nullable=True),
            sa.Column("license_key", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("is_valid", sa.Boolean(), nullable=False),
            sa.Column("activated_at", sa.DateTime(), nullable=True),
            sa.Column("last_validated_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("grace_until", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("cloud_sync_state"):
        op.create_table(
            "cloud_sync_state",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("last_pulled_event_id", sa.Integer(), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("cloud_sync_outbox"):
        op.create_table(
            "cloud_sync_outbox",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("event_id", sa.String(length=128), nullable=False),
            sa.Column("entity_type", sa.String(length=64), nullable=False),
            sa.Column("entity_id", sa.String(length=64), nullable=False),
            sa.Column("operation", sa.String(length=32), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("retry_count", sa.Integer(), nullable=False),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id"),
        )


def downgrade():
    op.drop_table("cloud_sync_outbox")
    op.drop_table("cloud_sync_state")
    op.drop_table("cloud_license_state")
    op.drop_table("cloud_instance_config")
