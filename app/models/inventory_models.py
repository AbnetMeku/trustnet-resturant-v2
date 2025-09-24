from datetime import datetime
from ..extensions import db

# ---------------------- Inventory Items ---------------------- #
# Only menu items that need inventory tracking will have an InventoryItem
class InventoryItem(db.Model):
    __tablename__ = "inventory_items"
    id = db.Column(db.Integer, primary_key=True)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False, unique=True)
    is_active = db.Column(db.Boolean, default=True)  # Optional flag to enable/disable tracking
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    menu_item = db.relationship("MenuItem", backref="inventory_item")
    store_stock = db.relationship("StoreStock", back_populates="inventory_item", uselist=False)
    station_stocks = db.relationship("StationStock", back_populates="inventory_item")
    purchases = db.relationship("StockPurchase", back_populates="inventory_item", cascade="all, delete-orphan")
    transfers = db.relationship("StockTransfer", back_populates="inventory_item", cascade="all, delete-orphan")


# ---------------------- Store Stock ---------------------- #
class StoreStock(db.Model):
    __tablename__ = "store_stock"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False, unique=True)
    quantity = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="store_stock")


# ---------------------- Station Stock ---------------------- #
class StationStock(db.Model):
    __tablename__ = "station_stock"
    id = db.Column(db.Integer, primary_key=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    quantity = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="station_stocks")
    station = db.relationship("Station", backref="station_stocks")


# ---------------------- Stock Purchases (Store History) ---------------------- #
class StockPurchase(db.Model):
    __tablename__ = "stock_purchases"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # NEW: status column
    status = db.Column(db.String(20), default="Purchased")  # Possible: Purchased, Updated, Deleted

    inventory_item = db.relationship("InventoryItem", back_populates="purchases")


# ---------------------- Stock Transfers (Store → Station History) ---------------------- #
class StockTransfer(db.Model):
    __tablename__ = "stock_transfers"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # NEW: status column
    status = db.Column(db.String(20), default="Transferred")  # Possible: Transferred, Updated, Deleted

    inventory_item = db.relationship("InventoryItem", back_populates="transfers")
    station = db.relationship("Station", backref="stock_transfers")
