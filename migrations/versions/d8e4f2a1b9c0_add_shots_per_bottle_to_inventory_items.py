"""add shots_per_bottle to inventory items

Revision ID: d8e4f2a1b9c0
Revises: c7e5f1a2b3c4
Create Date: 2026-03-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d8e4f2a1b9c0"
down_revision = "c7e5f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("inventory_items")}
    if "shots_per_bottle" not in columns:
        op.add_column(
            "inventory_items",
            sa.Column("shots_per_bottle", sa.Float(), nullable=False, server_default="0"),
        )

    # Backfill from existing ml data when available.
    op.execute(
        """
        UPDATE inventory_items
        SET shots_per_bottle = CASE
            WHEN container_size_ml > 0 AND default_shot_ml > 0 THEN container_size_ml / default_shot_ml
            ELSE 0
        END
        WHERE shots_per_bottle IS NULL OR shots_per_bottle = 0
        """
    )

    # Convert existing stock quantities from bottles to shots for bottle items.
    op.execute(
        """
        UPDATE store_stock
        SET quantity = quantity * (
            SELECT shots_per_bottle
            FROM inventory_items
            WHERE inventory_items.id = store_stock.inventory_item_id
        )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE station_stock
        SET quantity = quantity * (
            SELECT shots_per_bottle
            FROM inventory_items
            WHERE inventory_items.id = station_stock.inventory_item_id
        )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE stock_purchases
        SET quantity = quantity * (
            SELECT shots_per_bottle
            FROM inventory_items
            WHERE inventory_items.id = stock_purchases.inventory_item_id
        )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE stock_transfers
        SET quantity = quantity * (
            SELECT shots_per_bottle
            FROM inventory_items
            WHERE inventory_items.id = stock_transfers.inventory_item_id
        )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE store_stock_snapshots
        SET opening_quantity = opening_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = store_stock_snapshots.inventory_item_id
            ),
            purchased_quantity = purchased_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = store_stock_snapshots.inventory_item_id
            ),
            transferred_out_quantity = transferred_out_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = store_stock_snapshots.inventory_item_id
            ),
            closing_quantity = closing_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = store_stock_snapshots.inventory_item_id
            )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE station_stock_snapshots
        SET start_of_day_quantity = start_of_day_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = station_stock_snapshots.inventory_item_id
            ),
            added_quantity = added_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = station_stock_snapshots.inventory_item_id
            ),
            sold_quantity = sold_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = station_stock_snapshots.inventory_item_id
            ),
            void_quantity = void_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = station_stock_snapshots.inventory_item_id
            ),
            remaining_quantity = remaining_quantity * (
                SELECT shots_per_bottle FROM inventory_items
                WHERE inventory_items.id = station_stock_snapshots.inventory_item_id
            )
        WHERE inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
        )
        """
    )
    op.execute(
        """
        UPDATE inventory_menu_links
        SET serving_value = serving_value / NULLIF((
                SELECT default_shot_ml FROM inventory_items
                WHERE inventory_items.id = inventory_menu_links.inventory_item_id
            ), 0),
            deduction_ratio = serving_value / NULLIF((
                SELECT default_shot_ml FROM inventory_items
                WHERE inventory_items.id = inventory_menu_links.inventory_item_id
            ), 0)
        WHERE serving_type = 'custom_ml'
          AND inventory_item_id IN (
            SELECT id FROM inventory_items
            WHERE lower(unit) = 'bottle' AND shots_per_bottle > 0
          )
        """
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("inventory_items")}
    if "shots_per_bottle" in columns:
        op.drop_column("inventory_items", "shots_per_bottle")
