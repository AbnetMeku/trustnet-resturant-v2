from ..extensions import db
from ..utils.timezone import eat_now_naive

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=True)  # still nullable for waiters
    password_hash = db.Column(db.Text, nullable=True)
    pin_hash = db.Column(db.Text, nullable=True)
    role = db.Column(db.String(50), nullable=False)
    waiter_profile_id = db.Column(
        db.Integer,
        db.ForeignKey("waiter_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    waiter_profile = db.relationship("WaiterProfile", back_populates="waiters")
    waiter_day_closed_on = db.Column(db.Date, nullable=True)
# ---------------------- Tables ---------------------- #
# Many-to-many Waiter ↔ Table
waiter_table_assoc = db.Table(
    "waiter_table_assoc",
    db.Column("waiter_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
    db.Column("table_id", db.Integer, db.ForeignKey("tables.id"), primary_key=True),
)

waiter_profile_station_assoc = db.Table(
    "waiter_profile_station_assoc",
    db.Column(
        "waiter_profile_id",
        db.Integer,
        db.ForeignKey("waiter_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "station_id",
        db.Integer,
        db.ForeignKey("stations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class WaiterProfile(db.Model):
    __tablename__ = "waiter_profiles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    max_tables = db.Column(db.Integer, nullable=False, default=5)
    allow_vip = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=eat_now_naive, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=eat_now_naive,
        onupdate=eat_now_naive,
        nullable=False,
    )

    waiters = db.relationship("User", back_populates="waiter_profile")
    stations = db.relationship("Station", secondary=waiter_profile_station_assoc, backref="waiter_profiles")

class Table(db.Model):
    __tablename__ = "tables"
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(10), unique=True, nullable=False)
    status = db.Column(db.String(30), default="available")
    is_vip = db.Column(db.Boolean, default=False, nullable=False)
    orders = db.relationship("Order", back_populates="table")
    waiters = db.relationship("User", secondary=waiter_table_assoc, backref="tables")

# ---------------------- Stations ---------------------- #
class Station(db.Model):
    __tablename__ = "stations"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)  # used as PIN
    printer_identifier = db.Column(db.String(50), nullable=True)
    print_mode = db.Column(db.String(20), nullable=False, default="grouped")
    cashier_printer = db.Column(db.Boolean, nullable=False, default=False)
    menu_items = db.relationship("MenuItem", back_populates="station_rel")

# ---------------------- Menu Items ---------------------- #
  
class MenuItem(db.Model):
    __tablename__ = "menu_items"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(10, 2), nullable=True) #Nullable to allow VIP-only items
    vip_price = db.Column(db.Numeric, nullable=True)   # NEW 
    # Optional per-item override; when null, category default step is used.
    quantity_step = db.Column(db.Numeric(3, 2), nullable=True)
    is_available = db.Column(db.Boolean, default=True)
    image_url = db.Column(db.Text, nullable=True)  # Changed to Text


    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=False)
    station_rel = db.relationship("Station", back_populates="menu_items")

    subcategory_id = db.Column(db.Integer, db.ForeignKey("subcategories.id", ondelete="SET NULL"), nullable=True)
    subcategory = db.relationship("SubCategory", back_populates="menu_items")
# ---------------------- Orders and Order Items ---------------------- #
class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    table_id = db.Column(db.Integer, db.ForeignKey("tables.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String(20), default="pending")
    total_amount = db.Column(db.Numeric(15, 2))
    created_at = db.Column(db.DateTime, default=eat_now_naive)
    updated_at = db.Column(db.DateTime, default=eat_now_naive, onupdate=eat_now_naive)

    table = db.relationship("Table", back_populates="orders")
    user = db.relationship("User")
    items = db.relationship("OrderItem", back_populates="order")
    # ✅ Cascade delete for print jobs — automatically deleted if order deleted
    print_jobs = db.relationship("PrintJob", back_populates="order", cascade="all, delete-orphan")

class OrderItem(db.Model):
    __tablename__ = "order_items"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False)
    quantity = db.Column(db.Numeric(5, 2))
    printed_quantity = db.Column(db.Numeric(5, 2), default=0)  # NEW: Add this line
    price = db.Column(db.Numeric(10, 2), nullable=False)
    vip_price = db.Column(db.Numeric(10, 2))
    notes = db.Column(db.Text)
    prep_tag = db.Column(db.String(20))
    status = db.Column(db.String(20), default="pending")
    station = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=eat_now_naive)
    updated_at = db.Column(db.DateTime, default=eat_now_naive, onupdate=eat_now_naive)

    order = db.relationship("Order", back_populates="items")
    menu_item = db.relationship("MenuItem")

# ---------------------- Kitchen Tag Counter ---------------------- #
# This table tracks the last used tag number for each day    

class KitchenTagCounter(db.Model):
    __tablename__ = "kitchen_tag_counter"
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, unique=True)
    last_number = db.Column(db.Integer, default=0)


class TableNumberCounter(db.Model):
    __tablename__ = "table_number_counter"

    id = db.Column(db.Integer, primary_key=True, default=1)
    last_number = db.Column(db.Integer, nullable=False, default=0)

# ---------------------- Print JObs ---------------------- #
class PrintJob(db.Model):
    __tablename__ = "print_jobs"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    station_id = db.Column(db.Integer, db.ForeignKey("stations.id"), nullable=True)

    type = db.Column(db.String(20), default="station")  # "station" or "cashier"
    items_data = db.Column(db.JSON, nullable=False)

    status = db.Column(db.String(20), default="pending")
    error_message = db.Column(db.Text, nullable=True)
    printed_at = db.Column(db.DateTime, nullable=True)
    attempts = db.Column(db.Integer, default=0)
    retry_after = db.Column(db.DateTime, nullable=True)
    
    created_at = db.Column(db.DateTime, default=eat_now_naive)
    updated_at = db.Column(db.DateTime, default=eat_now_naive, onupdate=eat_now_naive)

    order = db.relationship("Order", back_populates="print_jobs")  # ✅ matches Order.print_jobs
    station = db.relationship("Station", backref="print_jobs")

# ---------------------- Categories and Subcategories ---------------------- #
# This table structure allows for a flexible menu organization
# Categories can have multiple subcategories, and each subcategory can have multiple menu items       

class Category(db.Model):
    __tablename__ = "categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    quantity_step = db.Column(db.Numeric(3, 2), nullable=False, default=1.0)
    subcategories = db.relationship(
        "SubCategory",
        back_populates="category",
        cascade="save-update",  # don't delete subcategories automatically
        passive_deletes=True
    )

class SubCategory(db.Model):
    __tablename__ = "subcategories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    category = db.relationship("Category", back_populates="subcategories")
    
    menu_items = db.relationship(
        "MenuItem",
        back_populates="subcategory",
        cascade="save-update",  # don't delete menu items automatically
        passive_deletes=True
    )

    __table_args__ = (
        db.UniqueConstraint('category_id', 'name', name='uq_subcategory_name_per_category'),
    )


class BrandingSettings(db.Model):
    __tablename__ = "branding_settings"

    id = db.Column(db.Integer, primary_key=True, default=1)
    logo_url = db.Column(db.Text, nullable=True)
    background_url = db.Column(db.Text, nullable=True)
    business_day_start_time = db.Column(db.String(5), nullable=False, default="06:00")
    print_preview_enabled = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(db.DateTime, default=eat_now_naive, onupdate=eat_now_naive)


class InventoryOutbox(db.Model):
    __tablename__ = "inventory_outbox"

    id = db.Column(db.Integer, primary_key=True)
    event_type = db.Column(db.String(50), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    retry_count = db.Column(db.Integer, nullable=False, default=0)
    last_error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=eat_now_naive, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=eat_now_naive,
        onupdate=eat_now_naive,
        nullable=False,
    )
