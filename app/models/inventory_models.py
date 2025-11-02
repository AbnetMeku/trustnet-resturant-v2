from datetime import datetime
from ..extensions import db

# ============================================================
# INVENTORY ITEM (Master item — registered before purchase)
# ============================================================
class InventoryItem(db.Model):
    __tablename__ = "inventory_items"
    id = db.Column(db.Integer, primary_key=True)
    
    # Inventory name (e.g., Gold Label)
    name = db.Column(db.String(120), nullable=False, unique=True)
    unit = db.Column(db.String(50), default="Bottle")  # Bottle, Shot, Liter, Kg, etc.
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    menu_links = db.relationship("InventoryMenuLink", back_populates="inventory_item", cascade="all, delete-orphan")
    store_stock = db.relationship("StoreStock", back_populates="inventory_item", uselist=False)
    station_stocks = db.relationship("StationStock", back_populates="inventory_item")
    purchases = db.relationship("StockPurchase", back_populates="inventory_item", cascade="all, delete-orphan")
    transfers = db.relationship("StockTransfer", back_populates="inventory_item", cascade="all, delete-orphan")
    snapshots = db.relationship("StationStockSnapshot", back_populates="inventory_item", cascade="all, delete-orphan")

# ============================================================
# MENU ITEM LINK (maps menu items to inventory items)
# ============================================================
class InventoryMenuLink(db.Model):
    __tablename__ = "inventory_menu_links"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False)
    
    # Deduction ratio: amount to deduct from inventory per sale of menu item
    deduction_ratio = db.Column(db.Float, nullable=False, default=1.0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="menu_links")
    menu_item = db.relationship("MenuItem", backref="inventory_links")

    __table_args__ = (
        db.UniqueConstraint("inventory_item_id", "menu_item_id", name="uq_inventory_menu_link"),
    )

# ============================================================
# STORE STOCK (main warehouse / storage)
# ============================================================
class StoreStock(db.Model):
    __tablename__ = "store_stock"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False, unique=True)
    quantity = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="store_stock")

# ============================================================
# STATION STOCK (per bar / kitchen / station)
# ============================================================
class StationStock(db.Model):
    __tablename__ = "station_stock"
    id = db.Column(db.Integer, primary_key=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    quantity = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="station_stocks")
    station = db.relationship("Station", backref="station_stocks")

    __table_args__ = (
        db.UniqueConstraint("station_id", "inventory_item_id", name="uq_station_inventory"),
    )

# ============================================================
# STOCK PURCHASES (Store history)
# ============================================================
class StockPurchase(db.Model):
    __tablename__ = "stock_purchases"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="Purchased")  # Purchased, Updated, Deleted

    inventory_item = db.relationship("InventoryItem", back_populates="purchases")

# ============================================================
# STOCK TRANSFERS (Store → Station)
# ============================================================
class StockTransfer(db.Model):
    __tablename__ = "stock_transfers"
    id = db.Column(db.Integer, primary_key=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="Transferred")  # Transferred, Updated, Deleted

    inventory_item = db.relationship("InventoryItem", back_populates="transfers")
    station = db.relationship("Station", backref="stock_transfers")

# ============================================================
# STATION STOCK SNAPSHOTS (daily stock logs)
# ============================================================
class StationStockSnapshot(db.Model):
    __tablename__ = "station_stock_snapshots"
    id = db.Column(db.Integer, primary_key=True)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False)
    snapshot_date = db.Column(db.Date, nullable=False)

    start_of_day_quantity = db.Column(db.Float, nullable=False)
    added_quantity = db.Column(db.Float, nullable=True, default=0.0)   # transfers/purchases
    sold_quantity = db.Column(db.Float, nullable=False, default=0.0)    # updated per order
    remaining_quantity = db.Column(db.Float, nullable=False, default=0.0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    inventory_item = db.relationship("InventoryItem", back_populates="snapshots")
    station = db.relationship("Station", backref="snapshots")

    __table_args__ = (
        db.UniqueConstraint("station_id", "inventory_item_id", "snapshot_date", name="uq_station_item_date"),
    )
