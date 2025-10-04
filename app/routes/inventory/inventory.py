# app/routes/inventory/inventory.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, StockPurchase, StockTransfer, StationStockSnapshot
from app.models import MenuItem, Station , OrderItem
from datetime import datetime, timedelta

inventory_bp = Blueprint("inventory_bp", __name__, url_prefix="/inventory")

# --------------------- CREATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase", methods=["POST"])
@jwt_required()
def add_purchase():
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    quantity = data.get("quantity")
    unit_price = data.get("unit_price", None)

    if not menu_item_id or quantity is None:
        return jsonify({"msg": "menu_item_id and quantity are required"}), 400

    menu_item = MenuItem.query.get(menu_item_id)
    if not menu_item:
        return jsonify({"msg": "Menu item not found"}), 404

    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    if not inventory_item:
        inventory_item = InventoryItem(menu_item_id=menu_item_id)
        db.session.add(inventory_item)
        db.session.commit()  # Get inventory_item.id

    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=quantity)
        db.session.add(store_stock)

    purchase = StockPurchase(
        inventory_item_id=inventory_item.id,
        quantity=quantity,
        unit_price=unit_price,
        status="Purchased"
    )
    db.session.add(purchase)
    db.session.commit()

    return jsonify({"msg": "Stock purchased successfully", "purchase_id": purchase.id}), 201

# --------------------- UPDATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_purchase(purchase_id):
    data = request.get_json()
    new_quantity = data.get("quantity")
    new_unit_price = data.get("unit_price", None)

    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    inventory_item = purchase.inventory_item
    if not inventory_item.store_stock:
        return jsonify({"msg": "Store stock not found"}), 404

    # Reverse old purchase
    inventory_item.store_stock.quantity -= purchase.quantity

    # Apply new values
    quantity = new_quantity if new_quantity is not None else purchase.quantity
    inventory_item.store_stock.quantity += quantity
    purchase.quantity = quantity

    if new_unit_price is not None:
        purchase.unit_price = new_unit_price

    purchase.status = "Updated"
    db.session.commit()
    return jsonify({"msg": "Purchase updated successfully"}), 200

# --------------------- DELETE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    if purchase.inventory_item.store_stock:
        purchase.inventory_item.store_stock.quantity -= purchase.quantity
        if purchase.inventory_item.store_stock.quantity < 0:
            purchase.inventory_item.store_stock.quantity = 0

    # Soft delete: update status instead of removing row
    purchase.status = "Deleted"
    db.session.commit()
    return jsonify({"msg": "Purchase deleted successfully"}), 200

# --------------------- CREATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer", methods=["POST"])
@jwt_required()
def transfer_stock():
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    station_id = data.get("station_id")
    quantity = data.get("quantity")

    if not menu_item_id or not station_id or quantity is None:
        return jsonify({"msg": "menu_item_id, station_id, and quantity are required"}), 400

    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    station = Station.query.get(station_id)
    if not inventory_item or not station:
        return jsonify({"msg": "Inventory item or station not found"}), 404

    if not inventory_item.store_stock or inventory_item.store_stock.quantity < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400

    inventory_item.store_stock.quantity -= quantity

    station_stock = StationStock.query.filter_by(
        station_id=station.id, inventory_item_id=inventory_item.id
    ).first()
    if station_stock:
        station_stock.quantity += quantity
    else:
        station_stock = StationStock(
            station_id=station.id, inventory_item_id=inventory_item.id, quantity=quantity
        )
        db.session.add(station_stock)

    transfer = StockTransfer(
        inventory_item_id=inventory_item.id,
        station_id=station.id,
        quantity=quantity,
        status="Transferred"
    )
    db.session.add(transfer)
    db.session.commit()

    return jsonify({"msg": "Stock transferred successfully", "transfer_id": transfer.id}), 201

# --------------------- UPDATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["PUT"])
@jwt_required()
def update_transfer(transfer_id):
    data = request.get_json()
    new_quantity = data.get("quantity")
    new_station_id = data.get("station_id")

    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    inventory_item = transfer.inventory_item

    # Reverse old transfer
    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += transfer.quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=transfer.quantity)
        db.session.add(store_stock)

    old_station_stock = StationStock.query.filter_by(
        station_id=transfer.station_id,
        inventory_item_id=inventory_item.id
    ).first()
    if old_station_stock:
        old_station_stock.quantity -= transfer.quantity
        if old_station_stock.quantity < 0:
            old_station_stock.quantity = 0

    # Apply new transfer
    quantity = new_quantity if new_quantity is not None else transfer.quantity
    station_id = new_station_id if new_station_id is not None else transfer.station_id

    if not inventory_item.store_stock or inventory_item.store_stock.quantity < quantity:
        db.session.rollback()
        return jsonify({"msg": "Insufficient store stock"}), 400

    inventory_item.store_stock.quantity -= quantity

    new_station = Station.query.get(station_id)
    if not new_station:
        db.session.rollback()
        return jsonify({"msg": "New station not found"}), 404

    new_station_stock = StationStock.query.filter_by(
        inventory_item_id=inventory_item.id, station_id=station_id
    ).first()
    if new_station_stock:
        new_station_stock.quantity += quantity
    else:
        new_station_stock = StationStock(
            inventory_item_id=inventory_item.id, station_id=station_id, quantity=quantity
        )
        db.session.add(new_station_stock)

    transfer.quantity = quantity
    transfer.station_id = station_id
    transfer.status = "Updated"
    db.session.commit()
    return jsonify({"msg": "Transfer updated successfully"}), 200

# --------------------- DELETE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    inventory_item = transfer.inventory_item

    # Restore to store
    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += transfer.quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=transfer.quantity)
        db.session.add(store_stock)

    # Remove from station
    station_stock = StationStock.query.filter_by(
        station_id=transfer.station_id,
        inventory_item_id=transfer.inventory_item_id
    ).first()
    if station_stock:
        station_stock.quantity -= transfer.quantity
        if station_stock.quantity < 0:
            station_stock.quantity = 0

    # Soft delete
    transfer.status = "Deleted"
    db.session.commit()
    return jsonify({"msg": "Transfer deleted successfully"}), 200

# --------------------- GET ALL PURCHASES --------------------- #
@inventory_bp.route("/purchases", methods=["GET"])
@jwt_required()
def get_all_purchases():
    purchases = StockPurchase.query.all()
    result = []
    for p in purchases:
        result.append({
            "id": p.id,
            "menu_item_id": p.inventory_item.menu_item.id,
            "menu_item": p.inventory_item.menu_item.name,
            "quantity": p.quantity,
            "unit_price": p.unit_price,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "status": p.status
        })
    return jsonify(result), 200

# --------------------- GET ALL TRANSFERS --------------------- #
@inventory_bp.route("/transfers", methods=["GET"])
@jwt_required()
def get_all_transfers():
    transfers = StockTransfer.query.all()
    result = []
    for t in transfers:
        result.append({
            "id": t.id,
            "menu_item_id": t.inventory_item.menu_item.id,
            "menu_item": t.inventory_item.menu_item.name,
            "station_id": t.station.id,
            "station": t.station.name,
            "quantity": t.quantity,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "status": t.status
        })
    return jsonify(result), 200

# --------------------- GET AVAILABLE ITEMS (WITH STOCK) --------------------- #
@inventory_bp.route("/available-items", methods=["GET"])
@jwt_required()
def get_available_items():
    items = (
        InventoryItem.query
        .join(StoreStock)
        .join(MenuItem)
        .filter(StoreStock.quantity > 0)
        .all()
    )

    result = []
    for i in items:
        result.append({
            "menu_item_id": i.menu_item.id,
            "menu_item": i.menu_item.name,
            "available_quantity": i.store_stock.quantity
        })

    return jsonify(result), 200

def deduct_station_stock(order_item: OrderItem):
    """Deduct inventory when an order item is ready.
    - Allows negative stock
    - Skips silently if StationStock missing
    - Never blocks status updates
    """
    try:
        station_name = order_item.station
        menu_item_id = order_item.menu_item_id

        # Get the inventory item
        inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
        if not inventory_item:
            print(f"[WARN] Inventory not found for menu_item_id={menu_item_id}")
            return

        # Get the station
        station = Station.query.filter_by(name=station_name).first()
        if not station:
            print(f"[WARN] Station '{station_name}' not found")
            return

        # Get the station stock
        station_stock = StationStock.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id
        ).first()

        if not station_stock:
            print(f"[WARN] StationStock missing for menu_item_id={menu_item_id} at station='{station_name}'")
            return

        # Deduct quantity (allow negative)
        station_stock.quantity -= float(order_item.quantity)
        db.session.commit()
        print(f"[INFO] Deducted {order_item.quantity} from {station_name} for menu_item_id={menu_item_id}")

    except Exception as e:
        # Never block; just log errors and rollback
        print(f"[ERROR] Error deducting stock for order_item_id={order_item.id}: {str(e)}")
        db.session.rollback()


# --------------------- GET OVERALL STOCK --------------------- #

@inventory_bp.route("/overall-stock", methods=["GET"])
@jwt_required()
def get_overall_stock():
    inventory_items = InventoryItem.query.join(MenuItem).all()
    result = []
    for i in inventory_items:
        store_qty = i.store_stock.quantity if i.store_stock else 0
        station_qty = sum(s.quantity for s in i.station_stocks)
        result.append({
            "menu_item": i.menu_item.name,
            "store_quantity": store_qty,
            "station_quantity": station_qty,
            "total_quantity": store_qty + station_qty
        })
    return jsonify(result), 200

# --------------------- GET STATION STOCK --------------------- #

@inventory_bp.route("/station-stock", methods=["GET"])
@jwt_required()
def get_station_stock():
    items = StationStock.query.join(InventoryItem).join(MenuItem).join(Station).all()
    result = []
    for s in items:
        result.append({
            "menu_item": s.inventory_item.menu_item.name,
            "menu_item_id": s.inventory_item.menu_item.id,
            "station": s.station.name,
            "quantity": s.quantity
        })
    return jsonify(result), 200

# --------------------- GET STORE STOCK --------------------- #

@inventory_bp.route("/store-stock", methods=["GET"])
@jwt_required()
def get_store_stock():
    items = StoreStock.query.join(InventoryItem).join(MenuItem).all()
    result = []
    for s in items:
        result.append({
            "menu_item_id": s.inventory_item.menu_item.id,
            "menu_item": s.inventory_item.menu_item.name,
            "quantity": s.quantity
        })
    return jsonify(result), 200

# --------------------- GET STATION STOCK WITH START OF DAY AND SOLD --------------------- #
@inventory_bp.route("/station-stock-with-sales", methods=["GET"])
@jwt_required()
def get_station_stock_with_sales():
    """
    Returns items per station including:
    - menu_item
    - start_of_day_quantity (from snapshot)
    - added_quantity (today's transfers)
    - sold_quantity (today's orders)
    - remaining_quantity (live stock)
    Uses snapshot for past days.
    """
    from datetime import date

    station_name = request.args.get("station")
    date_str = request.args.get("date")

    # Parse date
    try:
        query_date = datetime.fromisoformat(date_str).date() if date_str else datetime.utcnow().date()
    except ValueError:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    result = []

    # -------------------- TODAY -------------------- #
    if query_date == date.today():
        # Get stations
        stations_query = Station.query
        if station_name:
            stations_query = stations_query.filter_by(name=station_name)
        stations = stations_query.all()

        for station in stations:
            # Get snapshot for start of day
            snapshot = (
                StationStockSnapshot.query
                .filter_by(station_id=station.id, snapshot_date=query_date)
                .first()
            )

            # If no snapshot today, you may fallback to yesterday's snapshot
            start_of_day_qty_map = {}
            if snapshot:
                start_of_day_qty_map[snapshot.inventory_item_id] = snapshot.start_of_day_quantity
            else:
                # Fallback: yesterday's snapshot
                yesterday_snapshot = (
                    StationStockSnapshot.query
                    .filter_by(station_id=station.id, snapshot_date=query_date - timedelta(days=1))
                    .all()
                )
                for snap in yesterday_snapshot:
                    start_of_day_qty_map[snap.inventory_item_id] = snap.start_of_day_quantity

            # Get today's transfers
            transfers = (
                StockTransfer.query
                .filter_by(station_id=station.id)
                .filter(StockTransfer.status != "Deleted")
                .filter(db.func.date(StockTransfer.created_at) == query_date)
                .all()
            )
            added_map = {}
            for t in transfers:
                added_map[t.inventory_item_id] = added_map.get(t.inventory_item_id, 0) + t.quantity

            # Get today's sold from orders
            sold_qty_query = (
                db.session.query(
                    OrderItem.menu_item_id,
                    db.func.coalesce(db.func.sum(OrderItem.quantity), 0).label("sold_qty")
                )
                .filter(OrderItem.station == station.name)
                .filter(db.func.date(OrderItem.created_at) == query_date)
                .filter(OrderItem.status == "ready")   # ✅ only count ready items
                .group_by(OrderItem.menu_item_id)
                .all()
            )

            sold_map = {row.menu_item_id: float(row.sold_qty) for row in sold_qty_query}

            # Get live station stock
            live_stock = StationStock.query.filter_by(station_id=station.id).all()
            live_map = {s.inventory_item_id: s.quantity for s in live_stock}

            # Build result
            all_item_ids = set(list(start_of_day_qty_map.keys()) + list(added_map.keys()) + list(live_map.keys()))

            for item_id in all_item_ids:
                inventory_item = InventoryItem.query.get(item_id)
                if not inventory_item:
                    continue

                # Map sold qty by inventory item instead of menu item
                sold_qty = 0
                if inventory_item.menu_item_id in sold_map:
                    sold_qty = sold_map[inventory_item.menu_item_id]

                result.append({
                    "menu_item": inventory_item.menu_item.name if inventory_item.menu_item else None,
                    "menu_item_id": inventory_item.menu_item.id if inventory_item.menu_item else None,
                    "station": station.name,
                    "start_of_day_quantity": start_of_day_qty_map.get(item_id, 0),
                    "added_quantity": added_map.get(item_id, 0),
                    "sold_quantity": sold_qty,
                    "remaining_quantity": live_map.get(item_id, 0)
                })

    # -------------------- PAST DAYS -------------------- #
    else:
        snapshot_query = StationStockSnapshot.query.join(Station).join(InventoryItem)
        if station_name:
            snapshot_query = snapshot_query.filter(Station.name == station_name)
        snapshot_query = snapshot_query.filter(StationStockSnapshot.snapshot_date == query_date)
        snapshots = snapshot_query.all()

        for snap in snapshots:
            # sold quantity for the snapshot day
            sold_qty = float(
                db.session.query(db.func.coalesce(db.func.sum(OrderItem.quantity), 0))
                .filter(
                    OrderItem.station == snap.station.name,
                    OrderItem.menu_item_id == snap.inventory_item.menu_item.id,
                    db.func.date(OrderItem.created_at) == query_date,
                    OrderItem.status == "ready"   # ✅ only ready orders
                )
                .scalar()
            )


            remaining_qty = snap.start_of_day_quantity - sold_qty

            result.append({
                "menu_item": snap.inventory_item.menu_item.name,
                "menu_item_id": snap.inventory_item.menu_item.id,
                "station": snap.station.name,
                "start_of_day_quantity": snap.start_of_day_quantity,
                "added_quantity": snap.added_quantity, # from snapshot
                "sold_quantity": sold_qty,
                "remaining_quantity": remaining_qty
            })

    return jsonify(result), 200

# --------------------- GET STORE STOCK BY DATE --------------------- #
@inventory_bp.route("/store-stock-with-date", methods=["GET"])
@jwt_required()
def get_store_stock_with_date():
    """
    Returns store stock per menu item with columns:
    - menu_item
    - purchased (sum of purchases on the selected day)
    - transferred_out (sum of transfers on the selected day)
    - remaining (quantity at the end of the selected day)
    
    Accepts optional query param:
    - date=YYYY-MM-DD (defaults to today)
    """
    from datetime import date

    date_str = request.args.get("date")
    try:
        query_date = datetime.fromisoformat(date_str).date() if date_str else date.today()
    except ValueError:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    result = []

    inventory_items = InventoryItem.query.join(MenuItem).all()

    for item in inventory_items:
        # Purchased today
        purchased_today = float(
            db.session.query(db.func.coalesce(db.func.sum(StockPurchase.quantity), 0))
            .filter(
                StockPurchase.inventory_item_id == item.id,
                StockPurchase.status != "Deleted",
                db.func.date(StockPurchase.created_at) == query_date
            )
            .scalar()
        )

        # Transferred out today
        transferred_today = float(
            db.session.query(db.func.coalesce(db.func.sum(StockTransfer.quantity), 0))
            .filter(
                StockTransfer.inventory_item_id == item.id,
                StockTransfer.status != "Deleted",
                db.func.date(StockTransfer.created_at) == query_date
            )
            .scalar()
        )

        # Total purchased up to selected date
        total_purchased = float(
            db.session.query(db.func.coalesce(db.func.sum(StockPurchase.quantity), 0))
            .filter(
                StockPurchase.inventory_item_id == item.id,
                StockPurchase.status != "Deleted",
                db.func.date(StockPurchase.created_at) <= query_date
            )
            .scalar()
        )

        # Total transferred out up to selected date
        total_transferred = float(
            db.session.query(db.func.coalesce(db.func.sum(StockTransfer.quantity), 0))
            .filter(
                StockTransfer.inventory_item_id == item.id,
                StockTransfer.status != "Deleted",
                db.func.date(StockTransfer.created_at) <= query_date
            )
            .scalar()
        )

        # Remaining as of selected date
        remaining_at_date = total_purchased - total_transferred

        result.append({
            "menu_item_id": item.menu_item.id,
            "menu_item": item.menu_item.name,
            "purchased": purchased_today,
            "transferred_out": transferred_today,
            "remaining": remaining_at_date
        })

    return jsonify(result), 200


# --------------------- GET INVENTORY ITEMS WITH STATION --------------------- #
@inventory_bp.route("/items-with-station", methods=["GET"])
@jwt_required()
def get_items_with_station():
    """
    Returns all inventory items with their menu item name and assigned station.
    """
    items = InventoryItem.query.join(MenuItem).all()
    result = []

    for item in items:
        if item.menu_item.station_rel:  # ensure the menu item has a station
            result.append({
                "id": item.id,
                "name": item.menu_item.name,
                "station_id": item.menu_item.station_rel.id,
                "station_name": item.menu_item.station_rel.name
            })

    return jsonify(result), 200
# --------------------- CREATE MANUAL STATION SNAPSHOT --------------------- #
@inventory_bp.route("/station-snapshot", methods=["POST"])
@jwt_required()
def create_station_snapshot():
    """
    Creates snapshots for all stations for a given date.
    Accepts optional JSON body:
    - date: YYYY-MM-DD (defaults to today)
    
    For each inventory item in each station:
    - start_of_day_quantity = current stock
    - added_quantity = transfers into the station for that date (0 if none)
    - sold_quantity = 0
    - remaining_quantity = current stock
    """
    from datetime import date

    data = request.get_json() or {}
    date_str = data.get("date")
    
    try:
        snapshot_date = datetime.fromisoformat(date_str).date() if date_str else date.today()
    except ValueError:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    stations = Station.query.all()
    created_snapshots = []

    for station in stations:
        station_stock_items = StationStock.query.filter_by(station_id=station.id).all()
        for stock_item in station_stock_items:
            # Check if snapshot already exists
            existing = StationStockSnapshot.query.filter_by(
                station_id=station.id,
                inventory_item_id=stock_item.inventory_item_id,
                snapshot_date=snapshot_date
            ).first()
            if existing:
                continue  # skip existing snapshot

            # --- calculate transfers for the snapshot day ---
            added_qty = float(
                db.session.query(db.func.coalesce(db.func.sum(StockTransfer.quantity), 0))
                .filter(
                    StockTransfer.station_id == station.id,
                    StockTransfer.inventory_item_id == stock_item.inventory_item_id,
                    StockTransfer.status != "Deleted",
                    db.func.date(StockTransfer.created_at) == snapshot_date
                )
                .scalar()
            )

            snapshot = StationStockSnapshot(
                station_id=station.id,
                inventory_item_id=stock_item.inventory_item_id,
                snapshot_date=snapshot_date,
                start_of_day_quantity=stock_item.quantity,
                added_quantity=added_qty,
                sold_quantity=0,
                remaining_quantity=stock_item.quantity
            )
            db.session.add(snapshot)
            created_snapshots.append({
                "station": station.name,
                "inventory_item_id": stock_item.inventory_item_id,
                "snapshot_date": str(snapshot_date),
                "start_of_day_quantity": stock_item.quantity,
                "added_quantity": added_qty,
                "sold_quantity": 0,
                "remaining_quantity": stock_item.quantity
            })

    db.session.commit()

    return jsonify({
        "msg": f"Snapshots created for {len(created_snapshots)} items on {snapshot_date}",
        "snapshots": created_snapshots
    }), 201

# --------------------- BACKFILL SINGLE DAY SNAPSHOT --------------------- #
@inventory_bp.route("/station-snapshot-backfill-day", methods=["POST"])
@jwt_required()
def backfill_station_snapshot_day():
    """
    Backfills snapshots for all stations for a single day.
    Accepts JSON body:
    - date: YYYY-MM-DD (defaults to today)

    Calculates:
    - start_of_day_quantity: previous day's remaining or current stock
    - added_quantity: sum of transfers on that day
    - sold_quantity: sum of orders on that day
    - remaining_quantity: start + added - sold
    """
    from datetime import date, timedelta

    data = request.get_json() or {}
    date_str = data.get("date")

    try:
        target_date = datetime.fromisoformat(date_str).date() if date_str else date.today()
    except ValueError:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    created_snapshots = []

    stations = Station.query.all()

    for station in stations:
        # Get all items in this station
        station_items = StationStock.query.filter_by(station_id=station.id).all()
        item_ids = [s.inventory_item_id for s in station_items]

        for item_id in item_ids:
            # Skip if snapshot already exists
            existing = StationStockSnapshot.query.filter_by(
                station_id=station.id,
                inventory_item_id=item_id,
                snapshot_date=target_date
            ).first()
            if existing:
                continue

            # Start of day quantity = previous day's remaining, fallback to current stock
            prev_snapshot = StationStockSnapshot.query.filter_by(
                station_id=station.id,
                inventory_item_id=item_id,
                snapshot_date=target_date - timedelta(days=1)
            ).first()
            if prev_snapshot:
                start_of_day_qty = prev_snapshot.remaining_quantity
            else:
                live_stock = StationStock.query.filter_by(
                    station_id=station.id, inventory_item_id=item_id
                ).first()
                start_of_day_qty = live_stock.quantity if live_stock else 0

            # Added quantity (transfers)
            added_qty = float(
                db.session.query(db.func.coalesce(db.func.sum(StockTransfer.quantity), 0))
                .filter(
                    StockTransfer.station_id == station.id,
                    StockTransfer.inventory_item_id == item_id,
                    StockTransfer.status != "Deleted",
                    db.func.date(StockTransfer.created_at) == target_date
                )
                .scalar()
            )

            # Sold quantity
            menu_item_id = InventoryItem.query.get(item_id).menu_item.id
            sold_qty = float(
                db.session.query(db.func.coalesce(db.func.sum(OrderItem.quantity), 0))
                .filter(
                    OrderItem.station == station.name,
                    OrderItem.menu_item_id == menu_item_id,
                    db.func.date(OrderItem.created_at) == target_date
                )
                .scalar()
            )

            remaining_qty = start_of_day_qty + added_qty - sold_qty

            # Create snapshot
            snapshot = StationStockSnapshot(
                station_id=station.id,
                inventory_item_id=item_id,
                snapshot_date=target_date,
                start_of_day_quantity=start_of_day_qty,
                added_quantity=added_qty,
                sold_quantity=sold_qty,
                remaining_quantity=remaining_qty
            )
            db.session.add(snapshot)

            created_snapshots.append({
                "station": station.name,
                "inventory_item_id": item_id,
                "snapshot_date": target_date,
                "start_of_day_quantity": start_of_day_qty,
                "added_quantity": added_qty,
                "sold_quantity": sold_qty,
                "remaining_quantity": remaining_qty
            })

    db.session.commit()

    return jsonify({
        "msg": f"Backfilled {len(created_snapshots)} snapshots for {target_date}",
        "snapshots": created_snapshots
    }), 201
