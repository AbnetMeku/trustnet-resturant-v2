"""add cashier printer flag to stations

Revision ID: e2c4a9b7f6d1
Revises: d1b9c7e2a4f3
Create Date: 2026-03-01 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e2c4a9b7f6d1"
down_revision = "d1b9c7e2a4f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "stations",
        sa.Column("cashier_printer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.execute("UPDATE stations SET cashier_printer = FALSE WHERE cashier_printer IS NULL")


def downgrade():
    op.drop_column("stations", "cashier_printer")

