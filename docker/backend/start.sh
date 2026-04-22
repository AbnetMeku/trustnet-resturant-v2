#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
python - <<'PY'
import os
import time
import psycopg2

host = os.environ["DB_HOST"]
port = int(os.environ["DB_PORT"])
user = os.environ["DB_USER"]
password = os.environ["DB_PASSWORD"]
dbname = os.environ["DB_NAME"]

for attempt in range(1, 61):
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
            connect_timeout=3,
        )
        conn.close()
        print("PostgreSQL is ready.")
        break
    except Exception as exc:
        if attempt == 60:
            raise
        print(f"PostgreSQL not ready yet ({attempt}/60): {exc}")
        time.sleep(2)
PY

echo "Running database migrations..."
# Support multiple alembic heads by upgrading all heads.
flask --app run.py db upgrade heads

echo "Ensuring default admin user..."
python -m app.scripts.ensure_default_admin

echo "Starting print worker..."
worker_supervisor() {
  while true; do
    echo "Launching print worker..."
    python -m app.workers.PrintWorker
    EXIT_CODE=$?
    echo "Print worker exited with code ${EXIT_CODE}; restarting in 5 seconds..."
    sleep 5
  done
}

worker_supervisor &
WORKER_SUPERVISOR_PID=$!

echo "Starting POS API..."
gunicorn --bind 0.0.0.0:5050 --workers "${GUNICORN_WORKERS:-2}" --threads "${GUNICORN_THREADS:-4}" --timeout 120 wsgi:application &
API_PID=$!

cleanup() {
  kill -TERM "$WORKER_SUPERVISOR_PID" "$API_PID" 2>/dev/null || true
  wait "$WORKER_SUPERVISOR_PID" "$API_PID" 2>/dev/null || true
}

trap cleanup INT TERM

wait "$API_PID"
EXIT_CODE=$?
cleanup
exit "$EXIT_CODE"
