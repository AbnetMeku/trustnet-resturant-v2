from datetime import date
from app.models import InventoryMenuLink, StationStock, StationStockSnapshot
from app.extensions import db

def adjust_inventory_for_order_item(station_id, menu_item_id, quantity, reverse=False):
    """
    Deduct or revert inventory for a menu item sold at a specific station.
    
    Args:
        station_id: Station where the item is sold
        menu_item_id: Menu item sold
        quantity: Quantity sold (usually 1)
        reverse: If True, add back to inventory instead of deducting
    """
    links = InventoryMenuLink.query.filter_by(menu_item_id=menu_item_id).all()
    today = date.today()

    for link in links:
        inventory_item = link.inventory_item
        adjustment = link.deduction_ratio * quantity
        if reverse:
            adjustment = -adjustment  # add back to inventory

        # ---- Update StationStock ----
        station_stock = StationStock.query.filter_by(
            station_id=station_id,
            inventory_item_id=inventory_item.id
        ).first() 
        if not station_stock:
            station_stock = StationStock(
                station_id=station_id,
                inventory_item_id=inventory_item.id,
                quantity=0
            )
            db.session.add(station_stock)

        station_stock.quantity -= adjustment  # subtract negative = add back
        if station_stock.quantity < 0:
            station_stock.quantity = 0

        # ---- Update Snapshot ----
        snapshot = StationStockSnapshot.query.filter_by(
            station_id=station_id,
            inventory_item_id=inventory_item.id,
            snapshot_date=today
        ).first()

        if not snapshot:
            # Initialize snapshot at start of day if missing
            snapshot = StationStockSnapshot(
                station_id=station_id,
                inventory_item_id=inventory_item.id,
                snapshot_date=today,
                start_of_day_quantity=station_stock.quantity + adjustment,
                added_quantity=0,
                sold_quantity=0,
                remaining_quantity=station_stock.quantity + adjustment
            )
            db.session.add(snapshot)

        if reverse:
            snapshot.sold_quantity -= link.deduction_ratio * quantity
        else:
            snapshot.sold_quantity += link.deduction_ratio * quantity

        snapshot.remaining_quantity = snapshot.start_of_day_quantity + snapshot.added_quantity - snapshot.sold_quantity

    db.session.commit()
