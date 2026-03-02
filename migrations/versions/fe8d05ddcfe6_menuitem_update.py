"""MenuItem Update

Revision ID: fe8d05ddcfe6
Revises: df1085d0cbdf
Create Date: 2025-08-15 22:21:54.246458

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fe8d05ddcfe6'
down_revision = 'df1085d0cbdf'
branch_labels = None
depends_on = None


def upgrade():
    # No-op: this revision duplicates initial-table creation from another branch.
    return


def downgrade():
    return
