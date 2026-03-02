"""schema compat for tables and inventory

Revision ID: a1e4d6f8b9c2
Revises: f7b2a5e1c931
Create Date: 2026-03-01 23:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1e4d6f8b9c2"
down_revision = "f7b2a5e1c931"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    table_columns = {c["name"] for c in inspector.get_columns("tables")}
    if "is_vip" not in table_columns:
        op.add_column(
            "tables",
            sa.Column("is_vip", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute("UPDATE tables SET is_vip = FALSE WHERE is_vip IS NULL")

    inventory_columns = {c["name"] for c in inspector.get_columns("inventory_items")}
    if "name" not in inventory_columns:
        op.add_column("inventory_items", sa.Column("name", sa.String(length=120), nullable=True))
    if "unit" not in inventory_columns:
        op.add_column("inventory_items", sa.Column("unit", sa.String(length=50), nullable=True, server_default="Bottle"))

    refreshed_inventory_columns = {c["name"] for c in sa.inspect(bind).get_columns("inventory_items")}
    if "menu_item_id" in refreshed_inventory_columns:
        op.execute(
            """
            UPDATE inventory_items ii
            SET name = COALESCE(mi.name, 'Inventory Item ' || ii.id::text)
            FROM menu_items mi
            WHERE ii.menu_item_id = mi.id
              AND (ii.name IS NULL OR ii.name = '')
            """
        )
    op.execute(
        "UPDATE inventory_items SET name = 'Inventory Item ' || id::text WHERE name IS NULL OR name = ''"
    )
    op.execute("UPDATE inventory_items SET unit = 'Bottle' WHERE unit IS NULL OR unit = ''")

    # Ensure inventory item names are unique before creating unique constraint.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
            FROM inventory_items
            WHERE name IS NOT NULL
        )
        UPDATE inventory_items ii
        SET name = ii.name || ' #' || ranked.rn::text
        FROM ranked
        WHERE ii.id = ranked.id AND ranked.rn > 1
        """
    )

    # Make name required and unique.
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.alter_column("name", existing_type=sa.String(length=120), nullable=False)

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("inventory_items")}
    existing_uniques = {uq["name"] for uq in inspector.get_unique_constraints("inventory_items")}
    if "uq_inventory_items_name" not in existing_uniques and "uq_inventory_items_name" not in existing_indexes:
        op.create_unique_constraint("uq_inventory_items_name", "inventory_items", ["name"])

    table_names = set(inspector.get_table_names())
    if "inventory_menu_links" not in table_names:
        op.create_table(
            "inventory_menu_links",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("inventory_item_id", sa.Integer(), nullable=False),
            sa.Column("menu_item_id", sa.Integer(), nullable=False),
            sa.Column("deduction_ratio", sa.Float(), nullable=False, server_default="1.0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
            sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("inventory_item_id", "menu_item_id", name="uq_inventory_menu_link"),
        )

    # Backfill link table from legacy inventory_items.menu_item_id when available.
    final_inventory_columns = {c["name"] for c in sa.inspect(bind).get_columns("inventory_items")}
    if "menu_item_id" in final_inventory_columns:
        op.execute(
            """
            INSERT INTO inventory_menu_links (inventory_item_id, menu_item_id, deduction_ratio, created_at)
            SELECT ii.id, ii.menu_item_id, 1.0, ii.created_at
            FROM inventory_items ii
            WHERE ii.menu_item_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM inventory_menu_links l
                  WHERE l.inventory_item_id = ii.id AND l.menu_item_id = ii.menu_item_id
              )
            """
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    table_names = set(inspector.get_table_names())
    if "inventory_menu_links" in table_names:
        op.drop_table("inventory_menu_links")

    inventory_columns = {c["name"] for c in inspector.get_columns("inventory_items")}
    unique_constraints = {uq["name"] for uq in inspector.get_unique_constraints("inventory_items")}
    if "uq_inventory_items_name" in unique_constraints:
        op.drop_constraint("uq_inventory_items_name", "inventory_items", type_="unique")

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        if "name" in inventory_columns:
            batch_op.alter_column("name", existing_type=sa.String(length=120), nullable=True)
        if "unit" in inventory_columns:
            batch_op.drop_column("unit")
        if "name" in inventory_columns:
            batch_op.drop_column("name")

    table_columns = {c["name"] for c in inspector.get_columns("tables")}
    if "is_vip" in table_columns:
        op.drop_column("tables", "is_vip")
