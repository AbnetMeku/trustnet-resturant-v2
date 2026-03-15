import os
class Config:
    # Flask secret key - MUST be set in environment
    SECRET_KEY = os.environ["SECRET_KEY"]

    # Database connection info from environment variables - all required
    DB_USER = os.environ["DB_USER"]
    DB_PASSWORD = os.environ["DB_PASSWORD"]
    DB_HOST = os.environ["DB_HOST"]
    DB_PORT = os.environ["DB_PORT"]
    DB_NAME = os.environ["DB_NAME"]

    SQLALCHEMY_DATABASE_URI = (
        f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    INVENTORY_BASE_URL = os.environ.get("INVENTORY_BASE_URL", "http://127.0.0.1:5001")
    INVENTORY_SERVICE_KEY = os.environ.get("INVENTORY_SERVICE_KEY", "change-me")
    INVENTORY_SYNC_TIMEOUT_SECONDS = float(os.environ.get("INVENTORY_SYNC_TIMEOUT_SECONDS", "2"))
    INVENTORY_OUTBOX_BATCH_SIZE = int(os.environ.get("INVENTORY_OUTBOX_BATCH_SIZE", "50"))
    INVENTORY_OUTBOX_RETRY_INTERVAL_SECONDS = int(
        os.environ.get("INVENTORY_OUTBOX_RETRY_INTERVAL_SECONDS", "10")
    )
    CLOUD_BASE_URL = os.environ.get("CLOUD_BASE_URL", "https://rms.trustnetsolution.com")
    CLOUD_SYNC_TIMEOUT_SECONDS = float(os.environ.get("CLOUD_SYNC_TIMEOUT_SECONDS", "5"))
    CLOUD_SYNC_INTERVAL_SECONDS = int(os.environ.get("CLOUD_SYNC_INTERVAL_SECONDS", "600"))
    CLOUD_SYNC_BATCH_SIZE = int(os.environ.get("CLOUD_SYNC_BATCH_SIZE", "100"))
    CLOUD_SYNC_FULL_REPLACE = os.environ.get("CLOUD_SYNC_FULL_REPLACE", "")
    CLOUD_SYNC_FULL_REPLACE_FORCE = os.environ.get("CLOUD_SYNC_FULL_REPLACE_FORCE", "")
    CLOUD_LICENSE_VALIDATE_INTERVAL_SECONDS = int(
        os.environ.get("CLOUD_LICENSE_VALIDATE_INTERVAL_SECONDS", "604800")
    )
    CLOUD_DEVICE_GRACE_HOURS = int(os.environ.get("CLOUD_DEVICE_GRACE_HOURS", "360"))
    CLOUD_TENANT_ID = os.environ.get("CLOUD_TENANT_ID")
    CLOUD_STORE_ID = os.environ.get("CLOUD_STORE_ID")
    CLOUD_DEVICE_ID = os.environ.get("CLOUD_DEVICE_ID")
    CLOUD_DEVICE_NAME = os.environ.get("CLOUD_DEVICE_NAME", "local-restaurant-node")
    CLOUD_MACHINE_FINGERPRINT = os.environ.get("CLOUD_MACHINE_FINGERPRINT", "")
    CLOUD_LICENSE_KEY = os.environ.get("CLOUD_LICENSE_KEY", "")
    BRANDING_MAX_UPLOAD_BYTES = int(os.environ.get("BRANDING_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
    MENU_IMAGE_MAX_UPLOAD_BYTES = int(os.environ.get("MENU_IMAGE_MAX_UPLOAD_BYTES", str(3 * 1024 * 1024)))

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    # Override DB_NAME with TEST_DB_NAME env variable or fallback to parent's DB_NAME
    DB_NAME = os.environ.get("TEST_DB_NAME", Config.DB_NAME)
    SQLALCHEMY_DATABASE_URI = (
        f"postgresql://{Config.DB_USER}:{Config.DB_PASSWORD}@{Config.DB_HOST}:{Config.DB_PORT}/{DB_NAME}"
    )
