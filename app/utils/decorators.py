from functools import wraps
from flask_jwt_extended import verify_jwt_in_request, get_jwt
from flask import jsonify, request


def extract_roles_from_claims(claims):
    """
    Normalize JWT role claims to support both:
    - role: "admin"
    - roles: ["admin", ...] (legacy)
    """
    roles = set()

    role = claims.get("role")
    if isinstance(role, str) and role:
        normalized = role.strip().lower()
        if normalized:
            roles.add(normalized)

    legacy_roles = claims.get("roles")
    if isinstance(legacy_roles, list):
        for value in legacy_roles:
            if isinstance(value, str) and value:
                normalized = value.strip().lower()
                if normalized:
                    roles.add(normalized)
    elif isinstance(legacy_roles, str) and legacy_roles:
        normalized = legacy_roles.strip().lower()
        if normalized:
            roles.add(normalized)

    return roles


def roles_required(*allowed_roles):
    """
    Decorator to protect routes based on user roles.
    Skip JWT check on OPTIONS requests to allow CORS preflight.
    """
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            normalized_allowed_roles = {
                role.strip().lower()
                for role in allowed_roles
                if isinstance(role, str) and role.strip()
            }
            if request.method == "OPTIONS":
                # Skip JWT verification on OPTIONS request for CORS preflight
                return jsonify({"status": "ok"}), 200

            # Ensure JWT is present and valid
            verify_jwt_in_request()

            # Get claims from the token
            claims = get_jwt()

            # Support both current "role" and legacy "roles" claim shapes.
            user_roles = extract_roles_from_claims(claims)
            if not any(role in user_roles for role in normalized_allowed_roles):
                return jsonify(msg="Forbidden: Insufficient role"), 403

            # Role allowed — proceed with the original function
            return fn(*args, **kwargs)

        return decorator
    return wrapper
