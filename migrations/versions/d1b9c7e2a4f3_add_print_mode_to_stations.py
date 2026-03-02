"""add print_mode to stations

Revision ID: d1b9c7e2a4f3
Revises: c8a5f8e4a1d2
Create Date: 2026-02-28 14:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d1b9c7e2a4f3"
down_revision = "c8a5f8e4a1d2"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("stations")}

    if "print_mode" not in columns:
        op.add_column(
            "stations",
            sa.Column("print_mode", sa.String(length=20), nullable=False, server_default="grouped"),
        )

    op.execute(
        "UPDATE stations SET print_mode = 'grouped' "
        "WHERE print_mode IS NULL OR print_mode = ''"
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("stations")}
    if "print_mode" in columns:
        op.drop_column("stations", "print_mode")
