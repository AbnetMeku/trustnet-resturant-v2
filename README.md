# TrustNet Restaurant POS (Local) - POS + Inventory + Cloud Sync

This repository runs the local POS and Inventory services against the same database, with optional cloud sync to the TrustNet cloud backend.

**Quick Start**

1. Copy env template and update values:

```bash
copy .env.example .env
```

2. Build and run:

```bash
docker compose up -d --build
```

3. Open:
- Frontend: `http://localhost:8080`
- POS API: `http://localhost:5050`

---

**Architecture**

- `backend` container: POS API + PrintWorker
- `inventory` container: Inventory API
- `cloud-sync-agent` container: background cloud sync runner
- `postgres` container: database
- `frontend` container: Nginx + built UI

---

**Environment Variables**

Create `.env` based on `.env.example`. Required:

- `SECRET_KEY`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`

Inventory integration:

- `INVENTORY_BASE_URL` (default local `http://127.0.0.1:5001`)
- `INVENTORY_SERVICE_KEY`
- `INVENTORY_SYNC_TIMEOUT_SECONDS`
- `INVENTORY_OUTBOX_BATCH_SIZE`
- `INVENTORY_OUTBOX_RETRY_INTERVAL_SECONDS`

Cloud sync:

- `CLOUD_BASE_URL` (cloud backend URL)
- `CLOUD_TENANT_ID`
- `CLOUD_STORE_ID`
- `CLOUD_LICENSE_KEY`

Optional default admin bootstrap (backend startup):

- `DEFAULT_ADMIN_ENSURE` (default `true`)
- `DEFAULT_ADMIN_USERNAME` (default `admin`)
- `DEFAULT_ADMIN_PASSWORD` (default `admin`)
- `DEFAULT_ADMIN_ROLE` (default `admin`)
- `DEFAULT_ADMIN_RESET_PASSWORD` (default `false`)

---

**Docker**

Start all containers:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

Reset all local data:

```bash
docker compose down -v
```

Ports:
- `8080`: Frontend
- `5050`: POS API
- `5001`: Inventory API (internal by default, not exposed to host)
- `5432`: Postgres

---

**POS ⇄ Inventory Integration**

Flow:
1. POS calls Inventory API for stock adjustments.
2. If Inventory is down, POS writes to `inventory_outbox`.
3. Background worker retries until Inventory is reachable.

Internal Inventory endpoint (POS → Inventory):

- `POST /api/inventory/internal/adjust`
- Header: `X-Service-Key: <INVENTORY_SERVICE_KEY>`
- Payload:

```json
{
  "station_name": "Bar",
  "menu_item_id": 123,
  "quantity": 1.0,
  "reverse": false
}
```

---

**Cloud Sync**

Cloud sync runs as a background worker (`cloud-sync-agent`). It:
- Pushes local changes to cloud.
- Pulls cloud changes to local.
- Uses a durable outbox for retries.

Recommended: keep both event-driven sync and timed sync (safety net).

If sync stalls:
1. Check `cloud_sync_outbox` for `pending` rows.
2. Check cloud backend logs for rejected events.
3. Ensure `CLOUD_*` config is correct.

---

**Demo Data Seed**

Reset DB, run migrations, and seed demo data:

```bash
python bootstrap_pos_db.py --db-name trustnet_pos --target-orders 500 --days 45 --seed 77
```

Migrations only (no seed):

```bash
python bootstrap_pos_db.py --db-name trustnet_pos --skip-seed
```

Legacy seed-only:

```bash
python seed_demo_data.py --target-orders 500 --days 45 --seed 77
```

Demo logins:
- Admin: `admin_demo` / `admin123`
- Manager: `manager_demo` / `manager123`
- Cashier: `cashier_demo` / `cashier123`
- Waiters: `waiter_demo_1..8` / `waiter123` (PINs `1001..1008`)
- Stations (PIN): `1234` (Hot Kitchen, Grill, Bar, Pastry)

---

**Frontend (Vite) - Dev Mode**

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Vite proxy:
- `/api/*` → POS API
- `/api/inventory/*` → Inventory API

---

**Admin Settings UI**

Settings → tabs:
- Branding
- Operations
- License (status, device name, fingerprint, key update)

---

**E2E Tests (Playwright)**

Install browsers:

```bash
cd frontend
npx playwright install
```

Run:

```bash
cd frontend
E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e -- --project=chromium
```

Optional overrides:
- `E2E_ADMIN_USERNAME`
- `E2E_ADMIN_PASSWORD`
- `E2E_WAITER_PIN`
- `E2E_STATION_PIN`

---

**Load Testing (k6)**

Load test script (waiter + KDS flows, includes create order and add item):
- `scripts/k6/waiter_kds_load.js`

Prereqs:
1. Start the Docker stack.
2. Ensure demo PINs or your real PINs are available.

Run against the backend API (recommended for pure API performance):

```bash
# Linux/Ubuntu
docker run --rm -i --network host \
  -v "$(pwd)/scripts/k6:/scripts" \
  -e BASE_URL=http://127.0.0.1:5050 \
  -e WAITER_PIN=1001 -e STATION_PIN=1234 \
  grafana/k6 run /scripts/waiter_kds_load.js
```

Run against the frontend (Nginx proxy):

```bash
# Linux/Ubuntu
docker run --rm -i --network host \
  -v "$(pwd)/scripts/k6:/scripts" \
  -e BASE_URL=http://127.0.0.1:8080 \
  -e WAITER_PIN=1001 -e STATION_PIN=1234 \
  grafana/k6 run /scripts/waiter_kds_load.js
```

Report generation (summary JSON + time-series JSON):

```bash
mkdir -p scripts/k6/reports
docker run --rm -i --network host \
  -v "$(pwd)/scripts/k6:/scripts" \
  -e BASE_URL=http://127.0.0.1:5050 \
  -e WAITER_PIN=1001 -e STATION_PIN=1234 \
  grafana/k6 run \
    --summary-export /scripts/reports/waiter_kds_summary.json \
    --out json=/scripts/reports/waiter_kds_timeseries.json \
    /scripts/waiter_kds_load.js
```

Tuning (env vars):
- `TARGET_LOW`, `TARGET_HIGH` (default 20/50 VUs)
- `RAMP`, `HOLD`, `HOLD_HIGH` (default 30s/2m/2m)
- `LOGIN_EVERY` (default 5 iterations)
- `WAITER_PIN`, `STATION_PIN`, `BASE_URL`

---

**Troubleshooting**

Print jobs stuck in `pending`:
- Check `print_jobs.error_message` for unreachable printer.
- Verify printer config in Stations.

Cloud sync not pushing:
- Check `cloud_sync_outbox` for `pending` rows.
- Ensure cloud accepts events (no unique constraint conflicts).
- Check cloud backend logs for sync errors.

Inventory API errors:
- Ensure `INVENTORY_SERVICE_KEY` matches.
- Check Inventory container is healthy.

---

**Production Notes**

- Keep Postgres volume persistent to avoid device fingerprint changes.
- Keep timed sync enabled as a safety net.
- Set strong `SECRET_KEY` and admin credentials.
