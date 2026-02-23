"""add table number counter

Revision ID: 2f6b3fd1a77e
Revises: c4f7e2a6d901
Create Date: 2026-02-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2f6b3fd1a77e"
down_revision = "c4f7e2a6d901"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "table_number_counter",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO table_number_counter (id, last_number) VALUES (1, 0)")


def downgrade():
    op.drop_table("table_number_counter")
