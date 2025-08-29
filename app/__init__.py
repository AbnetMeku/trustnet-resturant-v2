from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_cors import CORS
from .config import DevelopmentConfig, TestingConfig, ProductionConfig
from .extensions import db, migrate, jwt
from .routes.cors.cors_setup import init_cors

config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}

def create_app(config_name="development"):
    app = Flask(__name__)
    config_class = config_map.get(config_name, DevelopmentConfig)
    app.config.from_object(config_class)

    # Ignore trailing slashes globally
    app.url_map.strict_slashes = False

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    init_cors(app)
    
    # Ensure models are imported
    from . import models

    # Helper function to register blueprints under /api
    def register_api(bp):
        prefix = "/api" + (bp.url_prefix or "")
        app.register_blueprint(bp, url_prefix=prefix)

    # ------------------- Register Blueprints -------------------
    from .routes import main_bp
    register_api(main_bp)

    from .routes.auth.auth import auth_bp
    register_api(auth_bp)

    from .routes.users.users import users_bp
    register_api(users_bp)

    from .routes.tables.tables import tables_bp
    register_api(tables_bp)
    
    from .routes.menu_items.menu_items import menu_items_bp
    register_api(menu_items_bp)

    from .routes.stations.stations import stations_bp
    register_api(stations_bp)

    from .routes.orders.order import orders_bp
    register_api(orders_bp)

    from .routes.stations.auth import stations_auth_bp
    register_api(stations_auth_bp)

    from .routes.stations.kds import stations_kds_bp
    register_api(stations_kds_bp)

    from .routes.categories.categories import categories_bp
    register_api(categories_bp)

    from .routes.categories.subcategories import subcategories_bp
    register_api(subcategories_bp)

    from .routes.reports.sales import reports_bp
    register_api(reports_bp)

    from .routes.print.print_jobs import print_jobs_bp
    register_api(print_jobs_bp)

    return app
