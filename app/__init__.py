from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_cors import CORS
from .config import DevelopmentConfig, TestingConfig, ProductionConfig
from .extensions import db, migrate, jwt

config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}

def create_app(config_name="development"):
    app = Flask(__name__)
    config_class = config_map.get(config_name, DevelopmentConfig)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    # Enable CORS for all routes (development only)
   # CORS(app, resources={r"/*": {"origins": "*"}})

    # Register models to ensure they are created in the database
    from . import models 
    
    # Register Blueprints...
    from .routes import main_bp
    app.register_blueprint(main_bp)
    
    from .routes.cors.cors_setup import init_cors
    init_cors(app)
    
    from .routes.auth.auth import auth_bp
    app.register_blueprint(auth_bp)

    from .routes.users.users import users_bp
    app.register_blueprint(users_bp)

    from .routes.tables.tables import tables_bp
    app.register_blueprint(tables_bp)
    
    from .routes.menu_items.menu_items import menu_items_bp
    app.register_blueprint(menu_items_bp) 

    from .routes.stations.stations import stations_bp
    app.register_blueprint(stations_bp) 

    from .routes.orders.order import orders_bp
    app.register_blueprint(orders_bp)

    from .routes.stations.auth import stations_auth_bp
    app.register_blueprint(stations_auth_bp)

    from .routes.stations.kds import stations_kds_bp
    app.register_blueprint(stations_kds_bp) 

    from .routes.categories.categories import categories_bp
    app.register_blueprint(categories_bp)  
    
    from .routes.categories.subcategories import subcategories_bp
    app.register_blueprint(subcategories_bp)     
    

    return app
