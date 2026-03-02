"""Increased Hash Limit

Revision ID: 949ed7e6e4df
Revises: 6831039cff8c
Create Date: 2025-08-12 00:24:01.594637

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '949ed7e6e4df'
down_revision = '6831039cff8c'
branch_labels = None
depends_on = None


def upgrade():
    # No-op: this revision duplicates initial-table creation from another branch.
    return


def downgrade():
    return
