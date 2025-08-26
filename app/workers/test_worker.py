import time
import json
import sys, os
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from escpos.printer import Network

# Ensure project root in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.models.models import PrintJob, Station  # <-- import your models

# --- DB setup (adjust URI to match your config) ---
engine = create_engine("postgresql://trustnet_pos:trustnet_pos_password@localhost:5432/trustnet_pos_db")
Session = sessionmaker(bind=engine)


def get_printer_ip(station_id, session):
    """Fetch printer IP/identifier for a given station"""
    station = session.query(Station).filter_by(id=station_id).first()
    return station.printer_identifier if station else None


def format_ticket(job, items_data):
    """Very simple formatting for testing"""
    lines = []
    lines.append(f"=== Print Job {job.id} ===")
    lines.append(f"Order: {job.order_id} | Station: {job.station_id}")
    lines.append("-" * 30)
    for item in items_data:
        lines.append(f"{item['name']} x{item['quantity']}")
    lines.append("-" * 30)
    lines.append(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"))
    return "\n".join(lines)


def print_job(printer_ip, text):
    """Open connection, send job, close connection"""
    printer = Network(printer_ip, port=9100, timeout=10)
    printer.set(align="left", bold=True)
    printer.text(text + "\n\n")
    printer.cut()
    printer.close()


def process_jobs():
    session = Session()
    jobs = session.query(PrintJob).filter_by(status="pending").all()

    for job in jobs:
        try:
            printer_ip = get_printer_ip(job.station_id, session)
            if not printer_ip:
                print(f"[WARN] No printer configured for station {job.station_id}")
                job.last_error = "No printer configured"
                job.status = "failed"
                session.commit()
                continue

            items_data = (
                json.loads(job.items_data) if isinstance(job.items_data, str) else job.items_data
            )
            ticket_text = format_ticket(job, items_data)

            # --- Try to print ---
            print_job(printer_ip, ticket_text)

            job.status = "completed"
            job.last_error = None
            job.retry_after = None
            print(f"[OK] Printed job {job.id} to {printer_ip}")

        except Exception as e:
            print(f"[ERROR] Failed to print job {job.id}: {e}")
            now = datetime.now(timezone.utc)

            # Retry only once after 1 minute
            if not job.retry_after:
                job.retry_after = now + timedelta(minutes=1)
                job.last_error = str(e)
                print(f"[INFO] Will retry job {job.id} at {job.retry_after}")
            else:
                if now >= job.retry_after:
                    job.status = "failed"
                    job.last_error = f"Final failure: {e}"
                    print(f"[FAIL] Job {job.id} permanently failed.")

        finally:
            session.commit()

    session.close()


if __name__ == "__main__":
    print("🎯 Worker started. Polling every 5s...")
    while True:
        process_jobs()
        time.sleep(5)
