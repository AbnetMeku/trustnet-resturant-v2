#!/bin/sh
set -e

flask --app run.py db upgrade
python -m app.workers.cloud_sync_worker
