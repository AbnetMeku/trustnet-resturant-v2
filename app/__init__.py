from .extensions import db, jwt, migrate
from .inventory_app import create_inventory_app
from .pos_app import create_pos_app

# Backward-compatible default app factory now points to POS service.
create_app = create_pos_app

__all__ = [
    "create_app",
    "create_pos_app",
    "create_inventory_app",
    "db",
    "migrate",
    "jwt",
]
