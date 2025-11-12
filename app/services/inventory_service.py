from datetime import date
from app.models import InventoryMenuLink, Station, StationStock, StationStockSnapshot
from app.extensions import db

def adjust_inventory_for_order_item(station_name, menu_item_id, quantity, reverse=False):
    """
    Deduct or revert inventory for a menu item sold at a specific station.

    Args:
        station_name: Name of the station where the item is sold
        menu_item_id: Menu item sold
        quantity: Quantity sold (numeric)
        reverse: If True, add back to inventory instead of deducting
    """
    if quantity <= 0:
        return  # no adjustment needed

    # Resolve station name to station ID
    station = Station.query.filter_by(name=station_name).first()
    if not station:
        # Station not found; skip adjustment
        return

    links = InventoryMenuLink.query.filter_by(menu_item_id=menu_item_id).all()
    if not links:
        return  # no linked inventory items

    today = date.today()

    for link in links:
        inventory_item = link.inventory_item
        deduction_amount = float(link.deduction_ratio) * float(quantity)
        if reverse:
            deduction_amount = -deduction_amount  # revert previous deduction

        # ---- Update StationStock ----
        station_stock = StationStock.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id
        ).first()
        if not station_stock:
            station_stock = StationStock(
                station_id=station.id,
                inventory_item_id=inventory_item.id,
                quantity=0
            )
            db.session.add(station_stock)

        # Deduct or add back (allow negative stock)
        station_stock.quantity -= deduction_amount

        # ---- Update Snapshot ----
        snapshot = StationStockSnapshot.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=today
        ).first()

        if not snapshot:
            snapshot = StationStockSnapshot(
                station_id=station.id,
                inventory_item_id=inventory_item.id,
                snapshot_date=today,
                start_of_day_quantity=station_stock.quantity + deduction_amount,
                added_quantity=0,
                sold_quantity=0,
                remaining_quantity=station_stock.quantity + deduction_amount
            )
            db.session.add(snapshot)

        # Adjust sold quantity
        if reverse:
            snapshot.sold_quantity -= deduction_amount
        else:
            snapshot.sold_quantity += deduction_amount

        # Update remaining stock
        snapshot.remaining_quantity = snapshot.start_of_day_quantity + snapshot.added_quantity - snapshot.sold_quantity

    db.session.commit()
