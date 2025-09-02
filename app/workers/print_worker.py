import sys
import os
import time
import socket
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from escpos.printer import Network
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.models.models import PrintJob, OrderItem, Station

# -----------------------------
# CONFIG
# -----------------------------
DATABASE_URI = os.environ.get(
    "DATABASE_URI"
) or "postgresql://trustnet_pos:trustnet_pos_password@localhost:5432/trustnet_pos_db"

FONT_PATH = os.path.join(os.path.dirname(__file__), "NotoSansEthiopic.ttf")
LOGO_PATH = os.path.join(os.path.dirname(__file__), "TNS.png")
PRINTER_WIDTH_PX = 576
CHECK_INTERVAL = 10      # seconds between polling for new jobs
MAX_RETRIES = 3

# -----------------------------
# DB Setup
# -----------------------------
engine = create_engine(DATABASE_URI)
Session = sessionmaker(bind=engine)

# -----------------------------
# Helper functions
# -----------------------------
def load_font(size=24):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def render_ticket(job: PrintJob, items: list, station_name: str, copy_type="station"):
    font = load_font()
    lines = []

    # Header
    lines.append(f"{station_name.upper()} - {copy_type.upper()}")
    lines.append(f"Order ID: {job.order_id}")
    lines.append(f"Table: {job.items_data.get('table', 'Unknown')}")
    lines.append(f"Waiter: {job.items_data.get('waiter', 'Unknown')}")
    lines.append(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("-" * 32)

    if job.type == "cashier":
        # Cashier receipt: detailed itemized list
        for item in items:
            name = item.get("name", "")[:20]  # Truncate for readability
            qty = float(item.get("quantity", 1))
            price = float(item.get("price", 0.0))
            total = float(item.get("total", qty * price))
            lines.append(f"{qty:.1f}x {name:<20} {price:>8.2f}")
            lines.append(f"{'':<22} Total: {total:>8.2f}")
            if item.get("notes"):
                lines.append(f"Notes: {item['notes'][:24]}")
        lines.append("-" * 32)
        total = float(job.items_data.get("total", 0))
        lines.append(f"Order Total: {total:>8.2f}")
    else:
        # Station ticket: existing format
        for item in items:
            line = f"{item.get('quantity', 1)}x {item.get('name', '')[:24]}"
            if item.get("prep_tag"):
                line = f"{item['prep_tag']} | {line}"
            lines.append(line)
            if item.get("notes"):
                lines.append(f"Notes: {item['notes']}")
        lines.append("-" * 32)

    lines.append("Thank you!")

    # Calculate text height
    line_height = font.getbbox("A")[3] - font.getbbox("A")[1] + 4
    text_height = len(lines) * line_height + 20

    # Calculate logo height
    logo_height = 0
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(logo.width, PRINTER_WIDTH_PX)
            logo_height = int(logo.height * logo_width / logo.width)
        except Exception as e:
            print(f"[WARN] Failed to load logo: {e}")

    # Create image with space for text and logo
    total_height = text_height + logo_height + 20  # Extra padding
    img = Image.new("1", (PRINTER_WIDTH_PX, total_height), 1)
    draw = ImageDraw.Draw(img)

    # Draw text
    y = 10
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (PRINTER_WIDTH_PX - text_width) // 2 if text_width < PRINTER_WIDTH_PX else 0
        draw.text((x, y), line, font=font, fill=0)
        y += line_height

    # Paste logo at the bottom
    if logo_height > 0:
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(logo.width, PRINTER_WIDTH_PX)
            logo = logo.resize((logo_width, logo_height))
            img.paste(logo, ((PRINTER_WIDTH_PX - logo_width) // 2, text_height))
        except Exception as e:
            print(f"[WARN] Failed to load logo: {e}")

    return img


def is_printer_reachable(ip, port=9100, timeout=2):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError):
        return False


def print_ticket_image(printer_ip, img):
    for attempt in range(1, MAX_RETRIES + 1):
        if not is_printer_reachable(printer_ip):
            print(f"[WARN] Printer {printer_ip} not reachable on attempt {attempt}")
            time.sleep(2)
            continue
        printer = None
        try:
            printer = Network(printer_ip, port=9100, timeout=30)
            printer.profile.profile_data["media"] = {
                "width": {"pixel": PRINTER_WIDTH_PX},
                "height": {"pixel": img.height},
            }
            printer.image(img)
            printer.cut()
            printer.close()
            print(f"[SUCCESS] Printed to {printer_ip} on attempt {attempt}")
            return True
        except ConnectionResetError as e:
            print(f"[ERROR] Connection reset on attempt {attempt} to {printer_ip}: {e}")
            time.sleep(5)
        except Exception as e:
            print(f"[ERROR] Printing attempt {attempt} to {printer_ip} failed: {e}")
            time.sleep(2)
        finally:
            if printer:
                try:
                    printer.close()
                except:
                    pass
    return False


# -----------------------------
# Job functions
# -----------------------------
def fetch_next_job(session):
    """Fetch the oldest pending job, mark as in_progress and return it."""
    job = (
        session.query(PrintJob)
        .filter(PrintJob.status == "pending")
        .order_by(PrintJob.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if job:
        job.status = "in_progress"
        session.commit()
        print(f"[LOCKED] Job {job.id} locked for printing")
        return job
    return None


def print_job(job: PrintJob):
    session = Session()
    try:
        station = session.get(Station, job.station_id) if job.station_id else None
        printer_ip = station.printer_identifier if station else "192.168.0.111"

        # Determine items
        copy_type = job.items_data.get("copy", "station")
        if copy_type == "customer":
            items = job.items_data.get("items", [])
        elif copy_type == "kitchen":
            item = job.items_data.get("item")
            items = [item] if item else []
        else:
            items = job.items_data.get("items", []) or [job.items_data.get("item")]

        # Render ticket
        img = render_ticket(job, items, station.name if station else "CASHIER", copy_type)

        # === DEVELOPMENT PREVIEW ===
        try:
            img.show(title=f"Job {job.id} Preview")  # Opens image viewer
        except Exception as e:
            print(f"[WARN] Could not preview image: {e}")
        # ============================

        # Attempt printing
        success = print_ticket_image(printer_ip, img)

        job_db = session.get(PrintJob, job.id)
        if job_db.status != "in_progress":
            print(f"[SKIP] Job {job.id} not in_progress (status={job_db.status})")
            return

        if success:
            job_db.status = "printed"
            job_db.printed_at = datetime.now(timezone.utc)
            for item_dict in items:
                item_id = item_dict.get("item_id")
                if item_id:
                    order_item = session.get(OrderItem, item_id)
                    if order_item:
                        order_item.status = "ready"
            print(f"[SUCCESS] Job {job.id} marked as printed")
        else:
            job_db.attempts = (job_db.attempts or 0) + 1
            if job_db.attempts >= MAX_RETRIES:
                job_db.status = "failed"
                print(f"[FAILED] Job {job.id} marked as failed after {job_db.attempts} attempts")
            else:
                job_db.status = "pending"
                job_db.retry_after = datetime.now(timezone.utc) + timedelta(seconds=60)
                print(f"[RETRY] Job {job.id} will retry later (attempt {job_db.attempts})")
        session.commit()
    except Exception as e:
        print(f"[CRITICAL] Job {job.id} processing error: {e}")
        session.rollback()
    finally:
        session.close()


# -----------------------------
# Worker loop
# -----------------------------
def worker_loop():
    print("[WORKER] Print worker started...")
    while True:
        session = Session()
        try:
            job = fetch_next_job(session)
            if job:
                print_job(job)
                time.sleep(1)  # Add delay between jobs to avoid overwhelming the printer
            else:
                time.sleep(CHECK_INTERVAL)
        except Exception as e:
            print(f"[ERROR] Worker loop exception: {e}")
        finally:
            session.close()


# -----------------------------
# Entry point
# -----------------------------
if __name__ == "__main__":
    worker_loop()