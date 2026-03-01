# TrustNet Restaurant - POS / Inventory Split (Phase 1)

This repository runs POS and Inventory as separate Flask services while keeping the same database.

## Services

- POS service: `run_pos.py` (default port `5000`)
- Inventory service: `run_inventory.py` (default port `5001`)

## Environment Variables

Required existing DB/env vars:

- `SECRET_KEY`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`

Standardized runtime database:

- `DB_NAME=trustnet_pos`

New integration vars:

- `INVENTORY_BASE_URL` (default: `http://127.0.0.1:5001`)
- `INVENTORY_SERVICE_KEY` (shared secret between services)
- `INVENTORY_SYNC_TIMEOUT_SECONDS` (default: `2`)
- `INVENTORY_OUTBOX_BATCH_SIZE` (default: `50`)
- `INVENTORY_OUTBOX_RETRY_INTERVAL_SECONDS` (default: `10`)

## How POS-Inventory Communication Works

1. POS sends inventory adjustment to Inventory service over HTTP.
2. If Inventory service is down/unreachable, POS writes the event into `inventory_outbox`.
3. A background worker in POS retries pending outbox events.

This allows POS order/KDS flow to continue even if inventory is temporarily unavailable.

## New Internal Inventory Endpoint

- `POST /api/inventory/internal/adjust`
- Required header: `X-Service-Key: <INVENTORY_SERVICE_KEY>`

Payload:

```json
{
  "station_name": "Bar",
  "menu_item_id": 123,
  "quantity": 1.0,
  "reverse": false
}
```

## Demo Data Seed

Use the standardized bootstrap script to reset DB, apply migrations, and seed demo data in one command:

```bash
python bootstrap_pos_db.py --db-name trustnet_pos --target-orders 500 --days 45 --seed 77
```

If you only want reset + migrations (no seed):

```bash
python bootstrap_pos_db.py --db-name trustnet_pos --skip-seed
```

Legacy seed-only command (kept for reference):

```bash
python seed_demo_data.py --target-orders 500 --days 45 --seed 77
```

Demo logins created:

- Admin: `admin_demo` / `admin123`
- Manager: `manager_demo` / `manager123`
- Cashier: `cashier_demo` / `cashier123`
- Waiters: `waiter_demo_1..8` / `waiter123` (PINs `1001..1008`)

## Docker (4 Containers)

This repo now includes a 4-container setup:

- `frontend` (Nginx + built React app)
- `backend` (POS API + PrintWorker in same container)
- `inventory` (Inventory API)
- `postgres` (PostgreSQL)

Run:

```bash
docker compose up -d --build
```

App URLs:

- Frontend: `http://localhost:8080`
- POS API: `http://localhost:5000`
- Inventory API: `http://localhost:5001`

Notes:

- Backend automatically runs `flask db upgrade` on startup.
- Frontend proxies `/api/inventory/*` to inventory container and other `/api/*` routes to backend.
