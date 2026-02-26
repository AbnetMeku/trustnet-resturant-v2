# app/services/inventory_service.py
from app.models import InventoryMenuLink, Station, StationStock, StationStockSnapshot
from app.extensions import db
from app.utils.timezone import get_eat_today

def adjust_inventory_for_order_item(station_name, menu_item_id, quantity, reverse=False):
    """
    Deduct or revert inventory for a menu item sold at a specific station.
    (unchanged logic, kept for completeness)
    """
    if quantity <= 0:
        return

    station = Station.query.filter_by(name=station_name).first()
    if not station:
        return

    links = InventoryMenuLink.query.filter_by(menu_item_id=menu_item_id).all()
    if not links:
        return

    today = get_eat_today()

    for link in links:
        inventory_item = link.inventory_item
        deduction_amount = float(link.deduction_ratio) * float(quantity)
        if reverse:
            deduction_amount = -deduction_amount

        # StationStock
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

        station_stock.quantity -= deduction_amount

        # Snapshot
        snapshot = StationStockSnapshot.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=today
        ).first()

        if not snapshot:
            # start_of_day should be pre-deduction quantity (station_stock.quantity + deduction_amount)
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

        if reverse:
            snapshot.sold_quantity -= deduction_amount
        else:
            snapshot.sold_quantity += deduction_amount

        snapshot.remaining_quantity = snapshot.start_of_day_quantity + (snapshot.added_quantity or 0) - (snapshot.sold_quantity or 0)

    db.session.commit()


# --------------------------
# Snapshot helper
# --------------------------
def get_or_create_today_snapshot(station_name, inventory_item_id):
    """
    Ensure a StationStockSnapshot exists for (station, inventory_item, today).
    If missing, create it using the current StationStock.quantity (PRE-TRANSFER).
    Returns the snapshot instance.
    """
    station = Station.query.filter_by(name=station_name).first()
    if not station:
        return None

    today = get_eat_today()

    snapshot = StationStockSnapshot.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item_id,
        snapshot_date=today
    ).first()

    if snapshot:
        return snapshot

    # Use the current station stock as start_of_day (this must be called BEFORE we change station_stock for a transfer)
    station_stock = StationStock.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item_id
    ).first()
    start_qty = station_stock.quantity if station_stock else 0

    snapshot = StationStockSnapshot(
        station_id=station.id,
        inventory_item_id=inventory_item_id,
        snapshot_date=today,
        start_of_day_quantity=start_qty,
        added_quantity=0,
        sold_quantity=0,
        remaining_quantity=start_qty
    )
    db.session.add(snapshot)
    db.session.commit()
    return snapshot


# --------------------------
# Transfer / addition adjustments
# --------------------------
def adjust_inventory_for_addition(station_name, inventory_item_id, quantity):
    """
    Record an addition (transfer/purchase) for a station:
      - Updates StationStock.quantity (caller may already change StationStock; this function only updates snapshot)
      - Updates StationStockSnapshot.added_quantity (can be negative to reverse),
        and recalculates remaining_quantity.
    IMPORTANT: This function assumes snapshot.start_of_day_quantity is already set (i.e. snapshot exists).
    """
    if quantity == 0:
        return

    station = Station.query.filter_by(name=station_name).first()
    if not station:
        return

    today = get_eat_today()

    # Ensure station stock exists (we do NOT change its quantity here; caller should have updated StationStock)
    station_stock = StationStock.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item_id
    ).first()
    if not station_stock:
        # If station_stock is missing, create it with 0 so DB has a row (caller might create it as well)
        station_stock = StationStock(
            station_id=station.id,
            inventory_item_id=inventory_item_id,
            quantity=0
        )
        db.session.add(station_stock)
        db.session.flush()  # get id if needed

    # Ensure snapshot exists (should be created BEFORE transfer modification ideally)
    snapshot = StationStockSnapshot.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item_id,
        snapshot_date=today
    ).first()

    if not snapshot:
        # If it's missing, create it using current station_stock.quantity as start_of_day (pre-transfer)
        # NOTE: caller should try to create snapshot BEFORE updating station_stock; this is a fallback.
        snapshot = StationStockSnapshot(
            station_id=station.id,
            inventory_item_id=inventory_item_id,
            snapshot_date=today,
            start_of_day_quantity=station_stock.quantity,
            added_quantity=0,
            sold_quantity=0,
            remaining_quantity=station_stock.quantity
        )
        db.session.add(snapshot)
        db.session.flush()

    # Update added_quantity (can be negative to reverse)
    snapshot.added_quantity = (snapshot.added_quantity or 0) + float(quantity)

    # Recalculate remaining
    snapshot.remaining_quantity = (snapshot.start_of_day_quantity or 0) + (snapshot.added_quantity or 0) - (snapshot.sold_quantity or 0)

    db.session.commit()
    return snapshot
