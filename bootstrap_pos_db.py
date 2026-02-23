import argparse
import os
import subprocess
import sys

from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except Exception as exc:  # pragma: no cover
    print(f"[ERROR] psycopg2 is required: {exc}")
    sys.exit(1)


def run_cmd(cmd, env=None):
    print(f"[RUN] {' '.join(cmd)}")
    subprocess.run(cmd, check=True, env=env)


HEAD_REVISION = "c4f7e2a6d901"


def reset_database(db_user: str, db_password: str, db_host: str, db_port: str, target_db: str, maintenance_db: str):
    conn = psycopg2.connect(
        dbname=maintenance_db,
        user=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    try:
        print(f"[INFO] Resetting database '{target_db}'...")
        cur.execute(
            """
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = %s AND pid <> pg_backend_pid()
            """,
            (target_db,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{target_db}"')
        cur.execute(f'CREATE DATABASE "{target_db}" OWNER "{db_user}"')
    finally:
        cur.close()
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Reset + migrate + seed TrustNet POS database.")
    parser.add_argument("--db-name", default="trustnet_pos", help="Target database name.")
    parser.add_argument("--maintenance-db", default="postgres", help="Maintenance database used to run CREATE/DROP.")
    parser.add_argument("--skip-seed", action="store_true", help="Only reset and migrate.")
    parser.add_argument("--target-orders", type=int, default=450, help="Seed: total demo orders.")
    parser.add_argument("--days", type=int, default=30, help="Seed: days back for generated orders.")
    parser.add_argument("--seed", type=int, default=42, help="Seed: random seed.")
    args = parser.parse_args()

    load_dotenv()

    db_user = os.environ.get("DB_USER")
    db_password = os.environ.get("DB_PASSWORD")
    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = os.environ.get("DB_PORT", "5432")

    missing = [name for name, value in {
        "DB_USER": db_user,
        "DB_PASSWORD": db_password,
        "DB_HOST": db_host,
        "DB_PORT": db_port,
    }.items() if not value]
    if missing:
        print(f"[ERROR] Missing required env vars: {', '.join(missing)}")
        sys.exit(1)

    target_db = args.db_name
    reset_database(
        db_user=db_user,
        db_password=db_password,
        db_host=db_host,
        db_port=db_port,
        target_db=target_db,
        maintenance_db=args.maintenance_db,
    )

    child_env = os.environ.copy()
    child_env["DB_NAME"] = target_db
    child_env["FLASK_APP"] = "run.py"

    # Migration history contains duplicate legacy creates; for fresh bootstrap we create schema
    # from models and stamp the DB at the consolidated current head.
    from app import create_app, db

    app = create_app("development")
    with app.app_context():
        db.create_all()

    run_cmd([sys.executable, "-m", "flask", "db", "stamp", HEAD_REVISION], env=child_env)

    if not args.skip_seed:
        run_cmd(
            [
                sys.executable,
                "seed_demo_data.py",
                "--target-orders",
                str(args.target_orders),
                "--days",
                str(args.days),
                "--seed",
                str(args.seed),
            ],
            env=child_env,
        )

    print("[DONE] Database is ready.")
    print(f"[DONE] Active DB: {target_db}")
    print("[DONE] Demo admin login: admin_demo / admin123")


if __name__ == "__main__":
    main()
