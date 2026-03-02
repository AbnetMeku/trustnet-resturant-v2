from decimal import Decimal

import pytest

from app import create_inventory_app, db
from app.models import InventoryItem, InventoryMenuLink, StationStock, StationStockSnapshot
from app.models.models import Category, MenuItem, Station, SubCategory
from app.services.inventory_service import adjust_inventory_for_order_item
from app.utils.timezone import get_eat_today


@pytest.fixture
def app():
    app = create_inventory_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def test_adjust_inventory_reverse_reduces_sold_quantity(app):
    with app.app_context():
        station = Station(name="Bar Reverse", password_hash="hash")
        category = Category(name="Drinks Reverse", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Beer Reverse", category=category)
        menu_item = MenuItem(
            name="Beer Reverse Item",
            price=Decimal("10.00"),
            station_rel=station,
            subcategory=subcategory,
            is_available=True,
        )
        inventory_item = InventoryItem(name="Beer Keg", unit="Bottle", is_active=True)
        db.session.add_all([station, category, subcategory, menu_item, inventory_item])
        db.session.flush()

        link = InventoryMenuLink(
            inventory_item_id=inventory_item.id,
            menu_item_id=menu_item.id,
            deduction_ratio=1.0,
        )
        station_stock = StationStock(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            quantity=10.0,
        )
        snapshot = StationStockSnapshot(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=get_eat_today(),
            start_of_day_quantity=10.0,
            added_quantity=0.0,
            sold_quantity=0.0,
            remaining_quantity=10.0,
        )
        db.session.add_all([link, station_stock, snapshot])
        db.session.commit()

        adjust_inventory_for_order_item(station.name, menu_item.id, 2.0, reverse=False)
        after_sale = StationStockSnapshot.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=get_eat_today(),
        ).one()
        assert after_sale.sold_quantity == 2.0
        assert after_sale.remaining_quantity == 8.0

        adjust_inventory_for_order_item(station.name, menu_item.id, 2.0, reverse=True)
        after_reverse = StationStockSnapshot.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=get_eat_today(),
        ).one()
        final_station_stock = StationStock.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
        ).one()

        assert after_reverse.sold_quantity == 0.0
        assert after_reverse.remaining_quantity == 10.0
        assert final_station_stock.quantity == 10.0
