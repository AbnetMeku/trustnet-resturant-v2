"""add kitchen tag subcategory ids to branding settings

Revision ID: a7b8c9d0e1f2
Revises: f1c2d3e4b5a6
Create Date: 2026-03-08 18:25:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7b8c9d0e1f2"
down_revision = "f1c2d3e4b5a6"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}

    if "kitchen_tag_subcategory_ids" not in columns:
        op.add_column("branding_settings", sa.Column("kitchen_tag_subcategory_ids", sa.JSON(), nullable=True))

    op.execute(
        """
        UPDATE branding_settings
        SET kitchen_tag_subcategory_ids = CASE
            WHEN kitchen_tag_subcategory_id IS NOT NULL THEN json_build_array(kitchen_tag_subcategory_id)
            ELSE '[]'::json
        END
        WHERE kitchen_tag_subcategory_ids IS NULL
        """
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    if "kitchen_tag_subcategory_ids" in columns:
        op.drop_column("branding_settings", "kitchen_tag_subcategory_ids")
