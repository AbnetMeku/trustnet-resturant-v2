# TRUSTNET-RESTAURANT/wsgi.py

from app import create_app

# Gunicorn looks for "application" by default
application = create_app()
