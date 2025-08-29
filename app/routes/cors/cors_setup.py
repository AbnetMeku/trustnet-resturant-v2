from flask_cors import CORS

def init_cors(app):
    """
    Initialize CORS for the given Flask app.
    Allows requests from frontend dev server with Authorization headers.
    """
    CORS(
        app,
        resources={r"/*": {"origins": "*"}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"]
    )
