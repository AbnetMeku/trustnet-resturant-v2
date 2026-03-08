#!/bin/sh
set -e

flask db upgrade
python -m app.workers.cloud_sync_worker
