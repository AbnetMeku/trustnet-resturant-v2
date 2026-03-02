"""Initial migration

Revision ID: 252b8a21a41d
Revises: 953ade75b174
Create Date: 2025-08-18 10:56:23.879345

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '252b8a21a41d'
down_revision = '953ade75b174'
branch_labels = None
depends_on = None


def upgrade():
    # No-op: this revision duplicates initial-table creation from another branch.
    return


def downgrade():
    return
