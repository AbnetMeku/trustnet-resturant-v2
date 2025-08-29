import sys
import os
import time
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from escpos.printer import Network
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.models.models import PrintJob, OrderItem, Station

# -----------------------------
# Config
# -----------------------------
DATABASE_URI = os.environ.get("DATABASE_URI") or "postgresql://trustnet_pos:trustnet_pos_password@localhost:5432/trustnet_pos_db"
FONT_PATH = os.path.join(os.path.dirname(__file__), "NotoSansEthiopic.ttf")
LOGO_PATH = os.path.join(os.path.dirname(__file__), "TNS.png")
PRINTER_WIDTH_PX = 576
CHECK_INTERVAL = 20
MAX_RETRIES = 3

engine = create_engine(DATABASE_URI)
Session = sessionmaker(bind=engine)

# -----------------------------
# Helper functions
# -----------------------------
def load_font(size=24):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except:
        return ImageFont.load_default()

def render_ticket(job: PrintJob, items: list, station_name: str, copy_type="station"):
    font = load_font()
    lines = []

    # Header
    lines.append(f"{station_name.upper()} - {copy_type.upper()}")
    lines.append(f"Order ID: {job.order_id}")
    lines.append(f"Time: {datetime.now().strftime('%H:%M:%S')}")
    lines.append("-" * 32)

    for item in items:
        line = f"{item['quantity']}x {item['name'][:24]}"
        if item.get("prep_tag"):
            line = f"{item['prep_tag']} | {line}"
        lines.append(line)
        if item.get("notes"):
            lines.append(f"Notes: {item['notes']}")
    lines.append("-" * 32)

    if job.type == "cashier":
        total = job.items_data.get("total", 0)
        lines.append(f"Total: {total}")
    lines.append("Thank you!")

    line_height = font.getbbox("A")[3] - font.getbbox("A")[1] + 4
    height = len(lines) * line_height + 20 + 300  # extra space for logo
    img = Image.new("1", (PRINTER_WIDTH_PX, height), 1)
    draw = ImageDraw.Draw(img)

    # Paste logo if exists
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(logo.width, PRINTER_WIDTH_PX)
            logo = logo.resize((logo_width, int(logo.height * logo_width / logo.width)))
            img.paste(logo, ( (PRINTER_WIDTH_PX - logo.width)//2, 0))
            y_offset = logo.height + 5
        except Exception as e:
            print(f"[WARN] Failed to load logo: {e}")
            y_offset = 10
    else:
        y_offset = 10

    # Draw lines
    y = y_offset
    for line in lines:
        bbox = draw.textbbox((0,0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (PRINTER_WIDTH_PX - text_width) // 2 if text_width < PRINTER_WIDTH_PX else 0
        draw.text((x, y), line, font=font, fill=0)
        y += line_height

    return img

def print_ticket_image(printer_ip, img):
    for attempt in range(1, MAX_RETRIES+1):
        try:
            printer = Network(printer_ip, port=9100, timeout=10)
            printer.profile.profile_data['media'] = {'width': {'pixel': PRINTER_WIDTH_PX}, 'height': {'pixel': img.height}}
            printer.image(img)
            printer.cut()
            printer.close()
            return True
        except Exception as e:
            print(f"[ERROR] Printing attempt {attempt} to {printer_ip} failed: {e}")
            time.sleep(1)
        finally:
            try:
                printer.close()
            except:
                pass
    return False

# -----------------------------
# Print a job
# -----------------------------
def print_job(job: PrintJob):
    session = Session()
    try:
        station = session.get(Station, job.station_id) if job.station_id else None
        printer_ip = station.printer_identifier if station else "192.168.1.111:9100"  # default IP

        # Skip if retry_after not reached
        if getattr(job, "retry_after", None) and datetime.now(timezone.utc) < job.retry_after:
            return

        # Determine items based on job copy type
        copy_type = job.items_data.get("copy", "station")
        if copy_type == "customer":
            items = job.items_data.get("items", [])
        elif copy_type == "kitchen":
            item = job.items_data.get("item")
            items = [item] if item else []
        else:
            items = job.items_data.get("items", []) or [job.items_data.get("item")]

        # Render and print once
        img = render_ticket(job, items, station.name if station else "CASHIER", copy_type)
        success = print_ticket_image(printer_ip, img)

        # Update DB
        job_db = session.get(PrintJob, job.id)
        if success:
            job_db.status = "printed"
            job_db.printed_at = datetime.now(timezone.utc)
            for item_dict in items:
                item_id = item_dict.get("item_id")
                if item_id:
                    order_item = session.get(OrderItem, item_id)
                    if order_item:
                        order_item.status = "ready"
        else:
            job_db.attempts = (job_db.attempts or 0) + 1
            if job_db.attempts >= MAX_RETRIES:
                job_db.status = "failed"
            else:
                job_db.status = "pending"
                job_db.retry_after = datetime.now(timezone.utc) + timedelta(seconds=60)

        session.commit()
    except Exception as e:
        print(f"[CRITICAL] Job {job.id} processing error: {e}")
    finally:
        session.close()


# -----------------------------
# Worker loop
# -----------------------------
def worker_loop():
    print("🚀 Print Worker Started")
    while True:
        session = Session()
        try:
            jobs = session.query(PrintJob).filter_by(status="pending").all()
            if jobs:
                print(f"Found {len(jobs)} pending jobs...")
            for job in jobs:
                print_job(job)
        except Exception as e:
            print(f"[CRITICAL] Worker loop error: {e}")
        finally:
            session.close()
        time.sleep(CHECK_INTERVAL)

# -----------------------------
# Entry
# -----------------------------
if __name__ == "__main__":
    worker_loop()
