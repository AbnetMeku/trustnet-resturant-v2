"""add kitchen tag target fields to branding settings

Revision ID: f1c2d3e4b5a6
Revises: b5d9a7c3e2f1
Create Date: 2026-03-08 14:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1c2d3e4b5a6"
down_revision = "b5d9a7c3e2f1"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}

    if "kitchen_tag_category_id" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("kitchen_tag_category_id", sa.Integer(), nullable=True),
        )
    if "kitchen_tag_subcategory_id" not in columns:
        op.add_column(
            "branding_settings",
            sa.Column("kitchen_tag_subcategory_id", sa.Integer(), nullable=True),
        )

    foreign_keys = {fk["constrained_columns"][0] for fk in inspector.get_foreign_keys("branding_settings") if fk.get("constrained_columns")}
    if "kitchen_tag_category_id" not in foreign_keys:
        op.create_foreign_key(
            "fk_branding_settings_kitchen_tag_category_id",
            "branding_settings",
            "categories",
            ["kitchen_tag_category_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "kitchen_tag_subcategory_id" not in foreign_keys:
        op.create_foreign_key(
            "fk_branding_settings_kitchen_tag_subcategory_id",
            "branding_settings",
            "subcategories",
            ["kitchen_tag_subcategory_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("branding_settings")}
    foreign_key_names = {fk["name"] for fk in inspector.get_foreign_keys("branding_settings") if fk.get("name")}

    if "fk_branding_settings_kitchen_tag_subcategory_id" in foreign_key_names:
        op.drop_constraint("fk_branding_settings_kitchen_tag_subcategory_id", "branding_settings", type_="foreignkey")
    if "fk_branding_settings_kitchen_tag_category_id" in foreign_key_names:
        op.drop_constraint("fk_branding_settings_kitchen_tag_category_id", "branding_settings", type_="foreignkey")

    if "kitchen_tag_subcategory_id" in columns:
        op.drop_column("branding_settings", "kitchen_tag_subcategory_id")
    if "kitchen_tag_category_id" in columns:
        op.drop_column("branding_settings", "kitchen_tag_category_id")
