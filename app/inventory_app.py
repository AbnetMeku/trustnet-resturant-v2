from flask import Flask
from dotenv import load_dotenv

load_dotenv()

from .config import DevelopmentConfig, ProductionConfig, TestingConfig
from .extensions import db, jwt, migrate
from .routes.cors.cors_setup import init_cors

config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def create_inventory_app(config_name="development"):
    app = Flask(__name__)
    config_class = config_map.get(config_name, DevelopmentConfig)
    app.config.from_object(config_class)
    app.url_map.strict_slashes = False
    if str(app.config.get("SQLALCHEMY_DATABASE_URI", "")).startswith("postgresql"):
        engine_options = dict(app.config.get("SQLALCHEMY_ENGINE_OPTIONS") or {})
        connect_args = dict(engine_options.get("connect_args") or {})
        connect_args.setdefault("options", "-c timezone=Africa/Addis_Ababa")
        engine_options["connect_args"] = connect_args
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    init_cors(app)

    from . import models
    from .models import inventory_models

    def register_api(bp):
        prefix = "/api" + (bp.url_prefix or "")
        app.register_blueprint(bp, url_prefix=prefix)

    from .routes.inventory.items import inventory_items_bp
    register_api(inventory_items_bp)

    from .routes.inventory.purchases import inventory_purchase_bp
    register_api(inventory_purchase_bp)

    from .routes.inventory.transfers import inventory_transfer_bp
    register_api(inventory_transfer_bp)

    from .routes.inventory.stock import inventory_stock_bp
    register_api(inventory_stock_bp)

    from .routes.inventory.snapshots import inventory_snapshot_bp
    register_api(inventory_snapshot_bp)

    from .routes.inventory.internal import inventory_internal_bp
    register_api(inventory_internal_bp)

    return app
