from flask import Flask, jsonify, request
from sqlalchemy.exc import OperationalError
from dotenv import load_dotenv
import os

load_dotenv()

from .config import DevelopmentConfig, ProductionConfig, TestingConfig
from .extensions import db, jwt, migrate
from .routes.cors.cors_setup import init_cors
from .workers.outbox_worker import start_inventory_outbox_worker
from .utils.timezone import eat_now_naive

config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def create_pos_app(config_name="development"):
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
    app.config.setdefault(
        "BRANDING_UPLOAD_DIR",
        os.path.join(app.root_path, "static", "branding"),
    )
    app.config.setdefault(
        "MENU_IMAGE_UPLOAD_DIR",
        os.path.join(app.root_path, "static", "menu_images"),
    )

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    init_cors(app)

    from . import models
    from .models import inventory_models

    def register_api(bp):
        prefix = "/api" + (bp.url_prefix or "")
        app.register_blueprint(bp, url_prefix=prefix)

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

    from .routes.orders.order_history import order_history_bp
    register_api(order_history_bp)

    from .routes.branding.branding import branding_bp
    register_api(branding_bp)

    from .routes.waiter_profiles.waiter_profiles import waiter_profiles_bp
    register_api(waiter_profiles_bp)

    from .routes.cloud.cloud_config import cloud_bp
    register_api(cloud_bp)

    from .models.models import CloudInstanceConfig, CloudLicensePolicy, CloudLicenseState

    def _is_license_locked() -> tuple[bool, str]:
        cfg = db.session.get(CloudInstanceConfig, 1)
        state = db.session.get(CloudLicenseState, 1)
        if not cfg or not cfg.tenant_id or not cfg.store_id or not cfg.license_key:
            return True, "Cloud license is not configured."

        policy = db.session.get(CloudLicensePolicy, 1)
        grace_days = int(getattr(policy, "grace_period_days", 15) or 15)
        lock_mode = (getattr(policy, "lock_mode", "full") or "full").strip().lower()
        grace_hours = grace_days * 24
        now = eat_now_naive()

        if lock_mode == "none":
            return False, ""

        if state and state.is_valid:
            if state.last_validated_at and grace_hours > 0:
                elapsed = (now - state.last_validated_at).total_seconds()
                if elapsed > grace_hours * 3600:
                    return True, "Cloud license validation expired."
            return False, ""

        if state and state.grace_until and now <= state.grace_until:
            return False, ""

        return True, "Cloud license validation failed."

    @app.before_request
    def enforce_cloud_license():
        if app.config.get("TESTING"):
            return None
        path = request.path or ""
        if not path.startswith("/api"):
            return None
        if request.method == "OPTIONS":
            return None

        allow_prefixes = ("/api/auth", "/api/cloud/config")
        if any(path.startswith(prefix) for prefix in allow_prefixes):
            return None

        locked, reason = _is_license_locked()
        if locked:
            return jsonify({"error": "License inactive", "detail": reason}), 403
        return None

    @app.errorhandler(OperationalError)
    def handle_operational_error(exc):
        message = str(exc).lower()
        if "no such table" in message or "undefined table" in message or "no such column" in message:
            return (
                jsonify(
                    {
                        "error": "Database schema is out of date. Please run migrations (flask db upgrade)."
                    }
                ),
                500,
            )
        return jsonify({"error": "Database operation failed."}), 500

    disable_inventory_outbox_worker = os.environ.get("DISABLE_INVENTORY_OUTBOX_WORKER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if not app.config.get("TESTING") and not disable_inventory_outbox_worker:
        start_inventory_outbox_worker(app)

    return app
