"""add waiter profiles

Revision ID: 9c32b31b0a11
Revises: 50cea51bf487
Create Date: 2026-02-22 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9c32b31b0a11"
down_revision = "50cea51bf487"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "waiter_profiles" not in tables:
        op.create_table(
            "waiter_profiles",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("max_tables", sa.Integer(), nullable=False),
            sa.Column("allow_vip", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "waiter_profile_id" not in user_columns:
        op.add_column("users", sa.Column("waiter_profile_id", sa.Integer(), nullable=True))

    user_fk_names = {fk["name"] for fk in inspector.get_foreign_keys("users") if fk.get("name")}
    if "fk_users_waiter_profile_id_waiter_profiles" not in user_fk_names:
        op.create_foreign_key(
            "fk_users_waiter_profile_id_waiter_profiles",
            "users",
            "waiter_profiles",
            ["waiter_profile_id"],
            ["id"],
            ondelete="SET NULL",
        )

    if "waiter_profile_station_assoc" not in tables:
        op.create_table(
            "waiter_profile_station_assoc",
            sa.Column("waiter_profile_id", sa.Integer(), nullable=False),
            sa.Column("station_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["station_id"],
                ["stations.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["waiter_profile_id"],
                ["waiter_profiles.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("waiter_profile_id", "station_id"),
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "waiter_profile_station_assoc" in tables:
        op.drop_table("waiter_profile_station_assoc")

    user_fk_names = {fk["name"] for fk in inspector.get_foreign_keys("users") if fk.get("name")}
    if "fk_users_waiter_profile_id_waiter_profiles" in user_fk_names:
        op.drop_constraint("fk_users_waiter_profile_id_waiter_profiles", "users", type_="foreignkey")

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "waiter_profile_id" in user_columns:
        op.drop_column("users", "waiter_profile_id")

    if "waiter_profiles" in tables:
        op.drop_table("waiter_profiles")
