import os

from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models.models import User
from app.pos_app import create_pos_app


def _as_bool(value: str, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def ensure_default_admin() -> None:
    ensure_enabled = _as_bool(os.getenv("DEFAULT_ADMIN_ENSURE"), default=True)
    if not ensure_enabled:
        print("Default admin bootstrap disabled (DEFAULT_ADMIN_ENSURE=false).")
        return

    username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin").strip() or "admin"
    password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")
    role = os.getenv("DEFAULT_ADMIN_ROLE", "admin").strip() or "admin"
    reset_password = _as_bool(os.getenv("DEFAULT_ADMIN_RESET_PASSWORD"), default=True)

    if not password:
        raise RuntimeError("DEFAULT_ADMIN_PASSWORD cannot be empty when admin bootstrap is enabled.")

    user = User.query.filter_by(username=username).first()
    if user is None:
        user = User(
            username=username,
            role=role,
            password_hash=generate_password_hash(password),
        )
        db.session.add(user)
        db.session.commit()
        print(f"Created default admin user '{username}'.")
        return

    changed = False
    if user.role != role:
        user.role = role
        changed = True
    if reset_password or not user.password_hash:
        user.password_hash = generate_password_hash(password)
        changed = True

    if changed:
        db.session.commit()
        print(f"Updated default admin user '{username}'.")
    else:
        print(f"Default admin user '{username}' already present.")


if __name__ == "__main__":
    app = create_pos_app()
    with app.app_context():
        ensure_default_admin()
