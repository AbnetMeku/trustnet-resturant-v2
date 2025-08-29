import time
from datetime import datetime, timezone
import os
from PIL import Image, ImageDraw, ImageFont
from escpos.printer import Network
from sqlalchemy.orm import sessionmaker

from app import create_app
from app.extensions import db
from app.models.models import PrintJob, Station

# -----------------------------
# CONFIG
# -----------------------------
PRINTER_DEFAULT_IP = "192.168.0.111"  # Default printer IP
CHECK_INTERVAL = 5  # seconds
MAX_RETRIES = 3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(BASE_DIR, "NotoSansEthiopic.ttf")  # Must support Amharic
LOGO_PATH = os.path.join(BASE_DIR, "TNS.png")

# -----------------------------
# FLASK APP
# -----------------------------
app = create_app()

# -----------------------------
# Helper: render text to image (Amharic support)
# -----------------------------
def render_text_to_image(lines, font_path=FONT_PATH, font_size=24):
    font = ImageFont.truetype(font_path, font_size)
    line_height = font.getsize("A")[1] + 4
    height = line_height * len(lines) + 40  # extra padding
    width = 576  # ~80mm at 203dpi
    img = Image.new("L", (width, height), 255)  # white background
    draw = ImageDraw.Draw(img)

    y = 10
    for line in lines:
        draw.text((10, y), line, font=font, fill=0)
        y += line_height
    return img

# -----------------------------
# Print a single job
# -----------------------------
def process_print_job(job: PrintJob):
    session = sessionmaker(bind=db.engine)()
    try:
        # Printer IP
        printer_ip = job.station.printer_identifier if job.station and job.station.printer_identifier else PRINTER_DEFAULT_IP
        p = Network(printer_ip)

        lines = []

        # Logo at top
        if os.path.exists(LOGO_PATH):
            logo = Image.open(LOGO_PATH).convert("L")
            p.image(logo)

        # Header
        lines.append(f"Order ID: {job.order_id}")
        lines.append(f"Type: {job.type.capitalize()}")
        lines.append(f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("-" * 32)

        # Items
        items = job.items_data.get("items") or []
        for item in items:
            name = item.get("name")
            qty = item.get("qty") or item.get("quantity") or 1
            notes = item.get("notes") or ""
            prep_tag = item.get("prep_tag") or ""
            lines.append(f"{name} x{qty}")
            if notes:
                lines.append(f"Notes: {notes}")
            if prep_tag:
                lines.append(f"Prep: {prep_tag}")
            lines.append("-" * 32)

        # Footer
        phone = "Tel: +251-000-000-000"
        if job.type == "cashier":
            total = job.items_data.get("total", "0")
            lines.append(f"Total: {total}")
            lines.append(phone)
            lines.append("Thank you for your order!")
        else:
            lines.append(phone)

        # Render and print
        img = render_text_to_image(lines)
        p.image(img)
        p.cut()

        # Mark printed
        job_db = session.get(PrintJob, job.id)
        job_db.status = "printed"
        job_db.printed_at = datetime.now(timezone.utc)
        session.commit()
        print(f"[SUCCESS] Printed job {job.id}")

    except Exception as e:
        job_db = session.get(PrintJob, job.id)
        job_db.attempts = (job_db.attempts or 0) + 1
        if job_db.attempts < MAX_RETRIES:
            job_db.status = "pending"
            print(f"[RETRY] Job {job.id} will retry (attempt {job_db.attempts})")
        else:
            job_db.status = "failed"
            job_db.error_message = str(e)
            print(f"[FAILED] Job {job.id} failed: {str(e)}")
        session.commit()
    finally:
        session.close()

# -----------------------------
# Worker loop
# -----------------------------
def worker_loop():
    while True:
        with app.app_context():
            jobs = PrintJob.query.filter_by(status="pending").all()
            if jobs:
                print(f"Found {len(jobs)} pending print jobs...")
            for job in jobs:
                process_print_job(job)
        time.sleep(CHECK_INTERVAL)

# -----------------------------
# Entry
# -----------------------------
if __name__ == "__main__":
    print("Starting print worker...")
    worker_loop()
