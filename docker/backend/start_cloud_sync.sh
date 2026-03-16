#!/bin/sh
set -e

# Support multiple alembic heads by upgrading all heads.
flask --app run.py db upgrade heads
python -m app.workers.cloud_sync_worker
