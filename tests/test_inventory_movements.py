from decimal import Decimal

import pytest
from flask_jwt_extended import create_access_token

from app import create_inventory_app, db
from app.models import (
    InventoryItem,
    Station,
    StationStock,
    StationStockSnapshot,
    StockPurchase,
    StockTransfer,
    StoreStock,
    StoreStockSnapshot,
    User,
)
from app.utils.timezone import get_eat_today
from datetime import timedelta


@pytest.fixture
def app():
    app = create_inventory_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def auth_headers(app):
    with app.app_context():
        admin = User(username="inventory_admin", password_hash="hash", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})
        return {"Authorization": f"Bearer {token}"}


def create_inventory_item(name="Jameson"):
    item = InventoryItem(
        name=name,
        unit="Bottle",
        serving_unit="ml",
        servings_per_unit=15.0,
        container_size_ml=750.0,
        default_shot_ml=50.0,
        is_active=True,
    )
    db.session.add(item)
    db.session.flush()
    return item


def test_delete_purchase_soft_deletes_and_preserves_history(client, app):
    headers = auth_headers(app)
    with app.app_context():
        item = create_inventory_item()
        db.session.add(StoreStock(inventory_item_id=item.id, quantity=10.0))
        purchase = StockPurchase(
            inventory_item_id=item.id,
            quantity=4.0,
            unit_price=Decimal("1200.00"),
            status="Purchased",
        )
        db.session.add(purchase)
        item.store_stock.quantity += 4.0
        db.session.commit()
        purchase_id = purchase.id
        item_id = item.id

    response = client.delete(f"/api/inventory/purchases/{purchase_id}", headers=headers)
    assert response.status_code == 200

    with app.app_context():
        purchase = StockPurchase.query.get(purchase_id)
        stock = StoreStock.query.filter_by(inventory_item_id=item_id).first()
        snapshot = StoreStockSnapshot.query.filter_by(inventory_item_id=item_id).first()
        assert purchase is not None
        assert purchase.status == "Deleted"
        assert stock.quantity == 10.0
        assert snapshot is not None
        assert snapshot.purchased_quantity == pytest.approx(-4.0)
        assert snapshot.closing_quantity == pytest.approx(10.0)

    history = client.get("/api/inventory/purchases/", headers=headers)
    assert history.status_code == 200
    payload = history.get_json()
    assert payload[0]["status"] == "Deleted"


def test_delete_purchase_rejects_when_stock_already_used(client, app):
    headers = auth_headers(app)
    with app.app_context():
        item = create_inventory_item("Red Label")
        db.session.add(StoreStock(inventory_item_id=item.id, quantity=2.0))
        purchase = StockPurchase(inventory_item_id=item.id, quantity=5.0, status="Purchased")
        db.session.add(purchase)
        db.session.commit()
        purchase_id = purchase.id

    response = client.delete(f"/api/inventory/purchases/{purchase_id}", headers=headers)
    assert response.status_code == 400
    assert "stock has already been used" in response.get_json()["msg"].lower()


def test_update_transfer_rejects_when_station_stock_has_been_consumed(client, app):
    headers = auth_headers(app)
    with app.app_context():
        station = Station(name="Bar", password_hash="hash")
        item = create_inventory_item("Vodka")
        db.session.add_all(
            [
                station,
                StoreStock(inventory_item_id=item.id, quantity=8.0),
                StationStock(inventory_item_id=item.id, station=station, quantity=1.0),
            ]
        )
        transfer = StockTransfer(
            inventory_item_id=item.id,
            station=station,
            quantity=3.0,
            status="Transferred",
        )
        db.session.add(transfer)
        db.session.commit()
        transfer_id = transfer.id

    response = client.put(
        f"/api/inventory/transfers/{transfer_id}",
        json={"quantity": 1.0},
        headers=headers,
    )
    assert response.status_code == 400
    assert "remaining station stock" in response.get_json()["msg"].lower()


def test_delete_transfer_soft_deletes_and_restores_stock(client, app):
    headers = auth_headers(app)
    with app.app_context():
        station = Station(name="Lounge", password_hash="hash")
        item = create_inventory_item("Gin")
        db.session.add_all(
            [
                station,
                StoreStock(inventory_item_id=item.id, quantity=6.0),
                StationStock(inventory_item_id=item.id, station=station, quantity=2.0),
            ]
        )
        transfer = StockTransfer(
            inventory_item_id=item.id,
            station=station,
            quantity=2.0,
            status="Transferred",
        )
        db.session.add(transfer)
        db.session.commit()
        transfer_id = transfer.id

    response = client.delete(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert response.status_code == 200

    with app.app_context():
        transfer = StockTransfer.query.get(transfer_id)
        store_stock = StoreStock.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
        station_stock = StationStock.query.filter_by(
            inventory_item_id=transfer.inventory_item_id,
            station_id=transfer.station_id,
        ).first()
        store_snapshot = StoreStockSnapshot.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
        station_snapshot = StationStockSnapshot.query.filter_by(
            inventory_item_id=transfer.inventory_item_id,
            station_id=transfer.station_id,
        ).first()
        assert transfer is not None
        assert transfer.status == "Deleted"
        assert store_stock.quantity == 8.0
        assert station_stock.quantity == 0.0
        assert store_snapshot is not None
        assert store_snapshot.transferred_out_quantity == pytest.approx(-2.0)
        assert store_snapshot.closing_quantity == pytest.approx(8.0)
        assert station_snapshot is not None
        assert station_snapshot.added_quantity == pytest.approx(-2.0)
        assert station_snapshot.remaining_quantity == pytest.approx(0.0)


def test_create_purchase_and_transfer_populate_snapshots(client, app):
    headers = auth_headers(app)
    with app.app_context():
        station = Station(name="Snapshot Bar", password_hash="hash")
        item = create_inventory_item("Tequila")
        db.session.add_all([station, StoreStock(inventory_item_id=item.id, quantity=5.0)])
        db.session.commit()
        item_id = item.id
        station_id = station.id

    purchase_response = client.post(
        "/api/inventory/purchases/",
        json={"inventory_item_id": item_id, "quantity": 2.0, "unit_price": 100.0},
        headers=headers,
    )
    assert purchase_response.status_code == 201

    transfer_response = client.post(
        "/api/inventory/transfers/",
        json={"inventory_item_id": item_id, "station_id": station_id, "quantity": 3.0},
        headers=headers,
    )
    assert transfer_response.status_code == 201

    with app.app_context():
        store_snapshot = StoreStockSnapshot.query.filter_by(inventory_item_id=item_id).one()
        station_snapshot = StationStockSnapshot.query.filter_by(
            inventory_item_id=item_id,
            station_id=station_id,
        ).one()
        store_stock = StoreStock.query.filter_by(inventory_item_id=item_id).one()
        station_stock = StationStock.query.filter_by(inventory_item_id=item_id, station_id=station_id).one()

        assert store_snapshot.opening_quantity == pytest.approx(5.0)
        assert store_snapshot.purchased_quantity == pytest.approx(2.0)
        assert store_snapshot.transferred_out_quantity == pytest.approx(3.0)
        assert store_snapshot.closing_quantity == pytest.approx(4.0)
        assert store_stock.quantity == pytest.approx(4.0)

        assert station_snapshot.start_of_day_quantity == pytest.approx(0.0)
        assert station_snapshot.added_quantity == pytest.approx(3.0)
        assert station_snapshot.void_quantity == pytest.approx(0.0)
        assert station_snapshot.remaining_quantity == pytest.approx(3.0)
        assert station_stock.quantity == pytest.approx(3.0)


def test_daily_history_endpoint_returns_store_and_station_ledgers(client, app):
    headers = auth_headers(app)
    with app.app_context():
        station = Station(name="Ledger Bar", password_hash="hash")
        item = create_inventory_item("Rum")
        db.session.add_all(
            [
                station,
                StoreStock(inventory_item_id=item.id, quantity=7.0),
                StationStock(inventory_item_id=item.id, station=station, quantity=2.0),
                StoreStockSnapshot(
                    inventory_item_id=item.id,
                    snapshot_date=get_eat_today(),
                    opening_quantity=9.0,
                    purchased_quantity=1.0,
                    transferred_out_quantity=3.0,
                    closing_quantity=7.0,
                ),
                StationStockSnapshot(
                    inventory_item_id=item.id,
                    station=station,
                    snapshot_date=get_eat_today(),
                    start_of_day_quantity=1.0,
                    added_quantity=2.0,
                    sold_quantity=1.0,
                    void_quantity=0.0,
                    remaining_quantity=2.0,
                ),
            ]
        )
        db.session.commit()

    response = client.get(f"/api/inventory/stock/daily-history?date={get_eat_today().isoformat()}", headers=headers)
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["business_date"] == get_eat_today().isoformat()
    assert payload["business_day_start"]
    assert payload["business_day_end"]

    store_row = next(row for row in payload["rows"] if row["scope_type"] == "store")
    station_row = next(row for row in payload["rows"] if row["scope_type"] == "station")

    assert store_row["opening_quantity"] == pytest.approx(9.0)
    assert store_row["purchased_quantity"] == pytest.approx(1.0)
    assert store_row["transferred_out_quantity"] == pytest.approx(3.0)
    assert store_row["closing_quantity"] == pytest.approx(7.0)

    assert station_row["scope_name"] == "Ledger Bar"
    assert station_row["opening_quantity"] == pytest.approx(1.0)
    assert station_row["transferred_in_quantity"] == pytest.approx(2.0)
    assert station_row["sold_quantity"] == pytest.approx(1.0)
    assert station_row["void_quantity"] == pytest.approx(0.0)
    assert station_row["closing_quantity"] == pytest.approx(2.0)


def test_daily_history_carries_forward_previous_day_snapshots_for_unchanged_items(client, app):
    headers = auth_headers(app)
    with app.app_context():
        station = Station(name="Carry Bar", password_hash="hash")
        item = create_inventory_item("Carry Whiskey")
        today = get_eat_today()
        yesterday = today - timedelta(days=1)
        db.session.add_all(
            [
                station,
                StoreStock(inventory_item_id=item.id, quantity=4.0),
                StationStock(inventory_item_id=item.id, station=station, quantity=1.5),
                StoreStockSnapshot(
                    inventory_item_id=item.id,
                    snapshot_date=yesterday,
                    opening_quantity=6.0,
                    purchased_quantity=0.0,
                    transferred_out_quantity=2.0,
                    closing_quantity=4.0,
                ),
                StationStockSnapshot(
                    inventory_item_id=item.id,
                    station=station,
                    snapshot_date=yesterday,
                    start_of_day_quantity=2.0,
                    added_quantity=0.0,
                    sold_quantity=0.5,
                    void_quantity=0.0,
                    remaining_quantity=1.5,
                ),
            ]
        )
        db.session.commit()

    response = client.get(f"/api/inventory/stock/daily-history?date={get_eat_today().isoformat()}", headers=headers)
    assert response.status_code == 200
    payload = response.get_json()

    store_row = next(row for row in payload["rows"] if row["scope_type"] == "store")
    station_row = next(row for row in payload["rows"] if row["scope_type"] == "station")

    assert store_row["opening_quantity"] == pytest.approx(4.0)
    assert store_row["closing_quantity"] == pytest.approx(4.0)
    assert store_row["purchased_quantity"] == pytest.approx(0.0)
    assert store_row["transferred_out_quantity"] == pytest.approx(0.0)

    assert station_row["opening_quantity"] == pytest.approx(1.5)
    assert station_row["closing_quantity"] == pytest.approx(1.5)
    assert station_row["transferred_in_quantity"] == pytest.approx(0.0)
    assert station_row["sold_quantity"] == pytest.approx(0.0)
    assert station_row["void_quantity"] == pytest.approx(0.0)
