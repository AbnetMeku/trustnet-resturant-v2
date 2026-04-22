"""add performance indexes for hot paths

Revision ID: b1c2d3e4f5a6
Revises: aa9b7c6d5e43, d3e4f5a6b7c8
Create Date: 2026-04-22 15:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = ("aa9b7c6d5e43", "d3e4f5a6b7c8")
branch_labels = None
depends_on = None


def _indexes_for_table(inspector, table_name):
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    users_indexes = _indexes_for_table(inspector, "users")
    if "ix_users_role_pin_hash" not in users_indexes:
        op.create_index("ix_users_role_pin_hash", "users", ["role", "pin_hash"], unique=False)

    orders_indexes = _indexes_for_table(inspector, "orders")
    if "ix_orders_status_created_at" not in orders_indexes:
        op.create_index("ix_orders_status_created_at", "orders", ["status", "created_at"], unique=False)
    if "ix_orders_user_id_created_at" not in orders_indexes:
        op.create_index("ix_orders_user_id_created_at", "orders", ["user_id", "created_at"], unique=False)
    if "ix_orders_table_id_created_at" not in orders_indexes:
        op.create_index("ix_orders_table_id_created_at", "orders", ["table_id", "created_at"], unique=False)

    order_items_indexes = _indexes_for_table(inspector, "order_items")
    if "ix_order_items_order_id" not in order_items_indexes:
        op.create_index("ix_order_items_order_id", "order_items", ["order_id"], unique=False)
    if "ix_order_items_station_status_created_at" not in order_items_indexes:
        op.create_index(
            "ix_order_items_station_status_created_at",
            "order_items",
            ["station", "status", "created_at"],
            unique=False,
        )
    if "ix_order_items_menu_item_id_created_at" not in order_items_indexes:
        op.create_index(
            "ix_order_items_menu_item_id_created_at",
            "order_items",
            ["menu_item_id", "created_at"],
            unique=False,
        )

    print_jobs_indexes = _indexes_for_table(inspector, "print_jobs")
    if "ix_print_jobs_order_id" not in print_jobs_indexes:
        op.create_index("ix_print_jobs_order_id", "print_jobs", ["order_id"], unique=False)
    if "ix_print_jobs_status_created_at" not in print_jobs_indexes:
        op.create_index("ix_print_jobs_status_created_at", "print_jobs", ["status", "created_at"], unique=False)

    stock_purchase_indexes = _indexes_for_table(inspector, "stock_purchases")
    if "ix_stock_purchases_inventory_item_id_created_at" not in stock_purchase_indexes:
        op.create_index(
            "ix_stock_purchases_inventory_item_id_created_at",
            "stock_purchases",
            ["inventory_item_id", "created_at"],
            unique=False,
        )

    stock_transfer_indexes = _indexes_for_table(inspector, "stock_transfers")
    if "ix_stock_transfers_inventory_item_id_created_at" not in stock_transfer_indexes:
        op.create_index(
            "ix_stock_transfers_inventory_item_id_created_at",
            "stock_transfers",
            ["inventory_item_id", "created_at"],
            unique=False,
        )
    if "ix_stock_transfers_station_id_created_at" not in stock_transfer_indexes:
        op.create_index(
            "ix_stock_transfers_station_id_created_at",
            "stock_transfers",
            ["station_id", "created_at"],
            unique=False,
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    users_indexes = _indexes_for_table(inspector, "users")
    if "ix_users_role_pin_hash" in users_indexes:
        op.drop_index("ix_users_role_pin_hash", table_name="users")

    orders_indexes = _indexes_for_table(inspector, "orders")
    if "ix_orders_status_created_at" in orders_indexes:
        op.drop_index("ix_orders_status_created_at", table_name="orders")
    if "ix_orders_user_id_created_at" in orders_indexes:
        op.drop_index("ix_orders_user_id_created_at", table_name="orders")
    if "ix_orders_table_id_created_at" in orders_indexes:
        op.drop_index("ix_orders_table_id_created_at", table_name="orders")

    order_items_indexes = _indexes_for_table(inspector, "order_items")
    if "ix_order_items_order_id" in order_items_indexes:
        op.drop_index("ix_order_items_order_id", table_name="order_items")
    if "ix_order_items_station_status_created_at" in order_items_indexes:
        op.drop_index("ix_order_items_station_status_created_at", table_name="order_items")
    if "ix_order_items_menu_item_id_created_at" in order_items_indexes:
        op.drop_index("ix_order_items_menu_item_id_created_at", table_name="order_items")

    print_jobs_indexes = _indexes_for_table(inspector, "print_jobs")
    if "ix_print_jobs_order_id" in print_jobs_indexes:
        op.drop_index("ix_print_jobs_order_id", table_name="print_jobs")
    if "ix_print_jobs_status_created_at" in print_jobs_indexes:
        op.drop_index("ix_print_jobs_status_created_at", table_name="print_jobs")

    stock_purchase_indexes = _indexes_for_table(inspector, "stock_purchases")
    if "ix_stock_purchases_inventory_item_id_created_at" in stock_purchase_indexes:
        op.drop_index("ix_stock_purchases_inventory_item_id_created_at", table_name="stock_purchases")

    stock_transfer_indexes = _indexes_for_table(inspector, "stock_transfers")
    if "ix_stock_transfers_inventory_item_id_created_at" in stock_transfer_indexes:
        op.drop_index("ix_stock_transfers_inventory_item_id_created_at", table_name="stock_transfers")
    if "ix_stock_transfers_station_id_created_at" in stock_transfer_indexes:
        op.drop_index("ix_stock_transfers_station_id_created_at", table_name="stock_transfers")
