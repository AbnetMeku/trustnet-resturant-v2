import sys
import os
import time
import socket
from datetime import timedelta
from PIL import Image, ImageDraw, ImageFont
from escpos.printer import Network
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.models.models import BrandingSettings, PrintJob, OrderItem, Station
from app.utils.timezone import eat_now, eat_now_naive

# -----------------------------
# CONFIG
# -----------------------------
DATABASE_URI = os.environ.get(
    "DATABASE_URI"
 # ) or "postgresql://trustnet_pos:trustnet_pos_password@localhost:5432/trustnet_pos_db"  
  ) or "postgresql://postgres:abnet@localhost:5433/postgres"

FONT_PATH = os.path.join(os.path.dirname(__file__), "NotoSansEthiopic.ttf")
LOGO_PATH = os.path.join(os.path.dirname(__file__), "TNS.png")
PRINTER_WIDTH_PX = 576  # 80mm printer resolution
CHECK_INTERVAL = 2     # seconds between polling for new jobs
MAX_RETRIES = 2

# -----------------------------
# DB Setup
# -----------------------------
engine = create_engine(DATABASE_URI)
Session = sessionmaker(bind=engine)

# -----------------------------
# Helper functions
# -----------------------------
def load_font(size=20):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()

def render_ticket(job: PrintJob, items: list, station_name: str, copy_type="station"):
    font_header = load_font(30)  # For restaurant name
    font_regular = load_font(20)  # For body text
    font_bold = load_font(30)    # For prep tag
    line_height = font_regular.getbbox("A")[3] - font_regular.getbbox("A")[1] + 4
    bold_line_height = font_bold.getbbox("A")[3] - font_bold.getbbox("A")[1] + 4
    header_line_height = font_header.getbbox("A")[3] - font_header.getbbox("A")[1] + 4

    logo_height = 0
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("1")
            logo_width = min(int(logo.width * 0.5), PRINTER_WIDTH_PX // 2)
            logo_height = int(logo.height * logo_width / logo.width) + 20
        except Exception as e:
            print(f"[WARN] Failed to load logo: {e}")

    print(f"Rendering job {job.id} with type: {job.type}, items_data: {job.items_data}")  # Debug log

    if job.type == "cashier":
        lines = []
        # Header
        lines.append(("Yonas Cher Cher", font_header, 'ma'))
        lines.append(("---- Non Fiscal ----", font_header, 'ma'))
        lines.append(("-" * 45, font_header, 'ma'))
        lines.append((f"ORDER #: {job.order_id}", font_header, 'la'))
        lines.append((f"DATE: {eat_now().strftime('%Y-%m-%d %H:%M:%S')}", font_header, 'la'))
        waiter_name = job.items_data.get("waiter", "Unknown")
        table_number = job.items_data.get("table", "N/A")
        lines.append((f"WAITER: {waiter_name}", font_regular, 'la'))
        lines.append((f"TABLE: {table_number}", font_regular, 'la'))
        lines.append(("-" * 92, font_regular, 'ma'))

        # Items with aligned columns
        subtotal = 0
        item_rows = []
        for item in items:
            qty = item.get("quantity", 1)
            price = item.get("price", 0.0)
            total = qty * price
            subtotal += total
            item_rows.append((item.get("name", ""), f"{qty} x {price:.2f}", f"{total:.2f}"))

        # Footer (only TOTAL, no SUBTOTAL)
        footer_lines = [
            ("-" * 92, font_regular, 'ma'),
            (f"TOTAL: {job.items_data.get('total', subtotal):.2f}ETB ", font_regular, 'ra'),
            ("THANK YOU!", font_regular, 'ma')
        ]

        # Height calculation
        header_lines = sum(1 for text, font, _ in lines if font == font_header)
        regular_lines = len(lines) - header_lines
        height = (
            (header_lines * header_line_height)
            + (regular_lines * line_height)
            + ((len(item_rows) + 1) * line_height)  # +1 for header row
            + (len(footer_lines) * line_height)
            + logo_height
            + 100
        )

        img = Image.new("1", (PRINTER_WIDTH_PX, height), 1)
        draw = ImageDraw.Draw(img)
        y = 10

        # Draw header
        for text, font, anchor in lines:
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            if anchor == 'ma':
                x = (PRINTER_WIDTH_PX - text_width) // 2
            elif anchor == 'ra':
                x = PRINTER_WIDTH_PX - text_width - 10
            else:
                x = 10
            draw.text((x, y), text, font=font, fill=0)
            y += (header_line_height if font == font_header else line_height) + 5

        # -----------------------------
        # Column Layout (Adjust here ↓)
        # -----------------------------
        col_item_x = 10      # left margin for Item names
        col_qty_x = 260      # horizontal position for Qty x Price
        col_total_x = 480    # right-side Total column
        # ↑ You can tweak these values if spacing looks off on your printer

        # Column headers
        draw.text((col_item_x, y), "Item", font=font_regular, fill=0)
        draw.text((col_qty_x, y), "Qty x Price", font=font_regular, fill=0)
        draw.text((col_total_x, y), "Total", font=font_regular, fill=0)
        y += line_height + 5
        draw.line((10, y, PRINTER_WIDTH_PX - 10, y), fill=0)  # underline
        y += 5

        # Draw items in 3 columns
        for name, qty_price, total in item_rows:
            draw.text((col_item_x, y), name[:28], font=font_regular, fill=0)  # longer item name allowed
            draw.text((col_qty_x, y), qty_price, font=font_regular, fill=0)
            bbox = draw.textbbox((0, 0), total, font=font_regular)
            draw.text((col_total_x, y), total, font=font_regular, fill=0)
            y += line_height + 5

        # Footer
        for text, font, anchor in footer_lines:
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            if anchor == 'ma':
                x = (PRINTER_WIDTH_PX - text_width) // 2
            elif anchor == 'ra':
                x = PRINTER_WIDTH_PX - text_width - 10
            else:
                x = 10
            draw.text((x, y), text, font=font, fill=0)
            y += line_height + 5

        # Paste logo
        if os.path.exists(LOGO_PATH):
            try:
                logo = Image.open(LOGO_PATH).convert("1")
                logo_width = min(int(logo.width * 0.5), PRINTER_WIDTH_PX // 2)
                logo = logo.resize((logo_width, int(logo.height * logo_width / logo.width)))
                img.paste(logo, ((PRINTER_WIDTH_PX - logo.width) // 2, y + 10))
            except Exception as e:
                print(f"[WARN] Failed to load logo: {e}")
    else:
        # Original station job format (with Amharic copy labels)
        lines = []

        # 🔹 Add Amharic headers depending on copy_type
        if copy_type == "customer":
            lines.append("ለደንበንኛ")   # Customer Copy
        elif copy_type == "kitchen":
            lines.append("ለኩሽና")       # Kitchen Copy

        # Header
        for item in items:
            if item.get("prep_tag"):
                lines.append(f"{item['prep_tag']}")
                break
        lines.append(f"Order ID: {job.order_id}")
        lines.append(f"Time: {eat_now().strftime('%H:%M:%S')}")
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
        bold_lines = 1 if any(item.get("prep_tag") for item in items) else 0
        regular_lines = len(lines) - bold_lines
        height = (regular_lines * line_height) + (bold_lines * bold_line_height) + logo_height

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

        # Paste logo at the bottom
        if os.path.exists(LOGO_PATH):
            try:
                logo = Image.open(LOGO_PATH).convert("1")
                logo_width = min(int(logo.width * 0.5), PRINTER_WIDTH_PX // 2)
                logo = logo.resize((logo_width, int(logo.height * logo_width / logo.width)))
                img.paste(logo, ((PRINTER_WIDTH_PX - logo.width) // 2, y + 10))
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
            printer = Network(printer_ip, port=9100, timeout=10)
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
            print(f"[ERROR] Printing attempt (attempt) to {printer_ip} failed: {e}")
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
        printer_ip = station.printer_identifier if station else "192.168.8.222"
        copy_type = job.items_data.get("copy", "station")
        if copy_type == "customer":
            items = job.items_data.get("items", [])
        elif copy_type == "kitchen":
            item = job.items_data.get("item")
            items = [item] if item else []
        else:
            items = job.items_data.get("items", []) or [job.items_data.get("item")]
        img = render_ticket(job, items, station.name if station else "CASHIER", copy_type)
        settings = session.get(BrandingSettings, 1)
        if settings and settings.print_preview_enabled:
            try:
                img.show(title=f"Job {job.id} Preview")
            except Exception as e:
                print(f"[WARN] Could not preview image: {e}")
        success = print_ticket_image(printer_ip, img)
        job_db = session.get(PrintJob, job.id)
        if job_db.status != "in_progress":
            print(f"[SKIP] Job {job.id} not in_progress (status={job_db.status})")
            return
        if success:
            job_db.status = "printed"
            job_db.printed_at = eat_now_naive()
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
                job_db.retry_after = eat_now_naive() + timedelta(seconds=60)
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
                time.sleep(1)
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
