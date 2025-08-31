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
    font_regular = load_font(24)  # Regular font for most text
    font_bold = load_font(30)    # Larger font to simulate bold for prep tag
    lines = []

    # Header
    # Add prep tag in "bold" (larger font) if present
    for item in items:
        if item.get("prep_tag"):
            lines.append(f"{item['prep_tag']}")
            break  # Only add the first prep tag found
    lines.append(f"Order ID: {job.order_id}")
    lines.append(f"Time: {datetime.now().strftime('%H:%M:%S')}")

    # Fix: Get waiter and table from items_data keys
    waiter_name = job.items_data.get("waiter", "Unknown")
    table_number = job.items_data.get("table", "N/A")
    lines.append(f"Waiter: {waiter_name}  Table: {table_number}")
    lines.append("." * 32)

    # Items
    for item in items:
        line = f"{item.get('quantity',1)}x {item.get('name','')[:24]}"
        lines.append(line)
        if item.get("notes"):
            lines.append(f"Notes: {item['notes']}")
    lines.append("." * 32)

    # Footer
    lines.append("Thank you!")

    # Calculate image height
    line_height = font_regular.getbbox("A")[3] - font_regular.getbbox("A")[1] + 4
    bold_line_height = font_bold.getbbox("A")[3] - font_bold.getbbox("A")[1] + 4
    logo_height = 0
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(int(logo.width * 0.5), PRINTER_WIDTH_PX // 2)  # Scale to 50% or max 50% of printer width
            logo_height = int(logo.height * logo_width / logo.width) + 20  # Extra padding
        except Exception as e:
            print(f"[WARN] Failed to load logo: {e}")

    # Count bold lines (prep tag, if present)
    bold_lines = 1 if any(item.get("prep_tag") for item in items) else 0
    regular_lines = len(lines) - bold_lines
    height = (regular_lines * line_height) + (bold_lines * bold_line_height) + 20 + logo_height

    img = Image.new("1", (PRINTER_WIDTH_PX, height), 1)
    draw = ImageDraw.Draw(img)

    # Draw text
    y = 10
    for line in lines:
        font = font_bold if line in [item.get("prep_tag") for item in items if item.get("prep_tag")] else font_regular
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (PRINTER_WIDTH_PX - text_width) // 2 if text_width < PRINTER_WIDTH_PX else 0
        draw.text((x, y), line, font=font, fill=0)
        y += bold_line_height if font == font_bold else line_height

    # Paste logo at the bottom with padding
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(int(logo.width * 0.5), PRINTER_WIDTH_PX // 2)  # Scale to 50% or max 50% of printer width
            logo = logo.resize((logo_width, int(logo.height * logo_width / logo.width)))
            img.paste(logo, ((PRINTER_WIDTH_PX - logo.width) // 2, y + 10))  # Add 10px padding
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