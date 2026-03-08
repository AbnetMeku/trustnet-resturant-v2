"""add waiter day-closed marker to users

Revision ID: 8f1a9d2c4b7e
Revises: 7a1c3d9f4e20
Create Date: 2026-02-27 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8f1a9d2c4b7e"
down_revision = "7a1c3d9f4e20"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "waiter_day_closed_on" not in columns:
        op.add_column("users", sa.Column("waiter_day_closed_on", sa.Date(), nullable=True))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "waiter_day_closed_on" in columns:
        op.drop_column("users", "waiter_day_closed_on")
