import time
import json
import sys
import os
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import joinedload
from escpos.printer import Network
from PIL import Image, ImageDraw, ImageFont


# Ensure project root in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.models.models import PrintJob, Station, OrderItem

# --- DB setup (adjust URI to match your config) ---
engine = create_engine("postgresql://trustnet_pos:trustnet_pos_password@localhost:5432/trustnet_pos_db")
Session = sessionmaker(bind=engine)

# --- Config ---
FONT_PATH = "NotoSansEthiopic.ttf"  # Optional TTF font for Amharic
LOGO_PATH = "TNS.png"
PRINTER_WIDTH_PX = 576  # typical 80mm printer
TICKET_PADDING = 10
LINE_HEIGHT = 25
MAX_RETRIES = 3

def load_font(size=18):
    """Load font with fallbacks"""
    try:
        if os.path.exists(FONT_PATH):
            return ImageFont.truetype(FONT_PATH, size)
        # Try common system fonts as fallback
        for font_name in ["Arial", "Helvetica", "DejaVuSans", "LiberationSans"]:
            try:
                return ImageFont.truetype(font_name, size)
            except:
                continue
        return ImageFont.load_default()
    except:
        return ImageFont.load_default()

def get_printer_config(station_id, session):
    """Get printer configuration with station relationship eager loading"""
    station = session.query(Station).options(joinedload(Station.print_jobs)).filter_by(id=station_id).first()
    if not station:
        return None, "Unknown Station"
    return station.printer_identifier, station.name

def create_ticket_image(job, items_data, station_name, customer_copy=False):
    """Creates an image of the ticket with proper error handling"""
    try:
        font = load_font()
        lines = []

        # Header
        lines.append("=" * 32)
        lines.append(f"STATION: {station_name.upper()}")
        lines.append(f"ORDER #: {job.order_id:06d}")
        lines.append(f"TIME: {datetime.now().strftime('%H:%M:%S')}")
        lines.append("=" * 32)

        # Item lines
        if "butcher" in station_name.lower():
            if customer_copy:
                lines.append("CUSTOMER COPY")
                lines.append("-" * 32)
                for item in items_data:
                    line = f"{item['quantity']}x {item['name'][:20]}"
                    if item.get("prep_tag"):
                        line = f"{item['prep_tag']} | {line}"
                    lines.append(line)
            else:
                lines.append("KITCHEN COPY")
                lines.append("-" * 32)
                for item in items_data:
                    line = f"{item['quantity']}x {item['name'][:20]}"
                    if item.get("prep_tag"):
                        line = f"{item['prep_tag']} | {line}"
                    lines.append(line)
        else:
            for item in items_data:
                lines.append(f"{item['quantity']}x {item['name'][:24]}")

        lines.append("=" * 32)
        lines.append("PLEASE PREPARE ASAP")
        lines.append("=" * 32)

        # Calculate image height
        height = TICKET_PADDING * 2 + LINE_HEIGHT * (len(lines) + 3)  # +3 for extra spacing

        # Create image with proper mode for thermal printers (1-bit)
        img = Image.new("1", (PRINTER_WIDTH_PX, height), color=1)  # 1 for white
        draw = ImageDraw.Draw(img)

        # Draw text
        y = TICKET_PADDING
        for line in lines:
            # Use textbbox to properly measure text
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            
            # Center text if it's shorter than printer width
            x = TICKET_PADDING
            if text_width < PRINTER_WIDTH_PX - (TICKET_PADDING * 2):
                x = (PRINTER_WIDTH_PX - text_width) // 2
            
            draw.text((x, y), line, font=font, fill=0)  # 0 for black
            y += LINE_HEIGHT

        return img

    except Exception as e:
        print(f"[ERROR] Failed to create image for job {job.id}: {e}")
        # Create a simple error image
        img = Image.new("1", (PRINTER_WIDTH_PX, 200), color=1)
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), f"ERROR: {e}", fill=0)
        return img

def print_ticket_image(printer_ip, img):
    """Send ticket image to printer with proper configuration"""
    try:
        # Create printer with explicit profile to avoid warnings
        printer = Network(printer_ip, port=9100, timeout=10)
        
        # Set explicit printer profile to avoid media.width.pixel warnings
        printer.profile.profile_data['media'] = {
            'width': {'pixel': PRINTER_WIDTH_PX},
            'height': {'pixel': img.height}
        }
        
        # Convert image to proper mode if needed
        if img.mode != '1':
            img = img.convert('1')
        
        # Print the image
        printer.image(img)
        printer.cut()
        printer.close()
        return True
        
    except Exception as e:
        print(f"[Printer Error] {printer_ip}: {e}")
        return False

def process_jobs():
    session = Session()
    try:
        # Get pending jobs with station relationship loaded
        jobs = session.query(PrintJob).filter(PrintJob.status == "pending").options(joinedload(PrintJob.station)).all()

        for job in jobs:
            try:
                printer_ip, station_name = get_printer_config(job.station_id, session)
                if not printer_ip:
                    print(f"[WARN] No printer configured for station {job.station_id}")
                    job.status = "failed"
                    job.last_error = "No printer configured"
                    session.commit()
                    continue

                # Parse items data
                if isinstance(job.items_data, str):
                    items_data = json.loads(job.items_data)
                else:
                    items_data = job.items_data

                print(f"[INFO] Processing job {job.id} for station {station_name}")

                # Determine what to print based on station type
                tickets_to_print = []
                
                if "butcher" in station_name.lower():
                    # Butcher: customer copy + kitchen copy
                    tickets_to_print.append(create_ticket_image(job, items_data, station_name, customer_copy=True))
                    tickets_to_print.append(create_ticket_image(job, items_data, station_name, customer_copy=False))
                else:
                    # Other stations: single summary
                    tickets_to_print.append(create_ticket_image(job, items_data, station_name))

                # Print all tickets
                all_success = True
                for i, ticket_img in enumerate(tickets_to_print):
                    success = print_ticket_image(printer_ip, ticket_img)
                    all_success = all_success and success
                    if i < len(tickets_to_print) - 1:  # Small delay between tickets, but not after last
                        time.sleep(0.5)

                if all_success:
                    job.status = "completed"
                    job.last_error = None
                    job.retry_after = None
                    print(f"[SUCCESS] Printed job {job.id} to {printer_ip}")
               
                    # Update related order items to 'ready'
                    order_items = session.query(OrderItem).filter(
                        OrderItem.order_id == job.order_id,
                        OrderItem.status == "pending"
                    ).all()
                    for item in order_items:
                        # Optional: further filter by station if needed
                        if item.station == job.station.name:
                            item.status = "ready"
                    session.commit()
                else:
                    job.attempts = (job.attempts or 0) + 1
                    if job.attempts >= MAX_RETRIES:
                        job.status = "failed"
                        job.last_error = "Max retries exceeded"
                        print(f"[FAIL] Job {job.id} failed after {MAX_RETRIES} attempts")
                    else:
                        job.retry_after = datetime.now(timezone.utc) + timedelta(minutes=1)
                        print(f"[RETRY] Job {job.id} will retry at {job.retry_after}")

            except Exception as e:
                print(f"[ERROR] Failed to process job {job.id}: {e}")
                job.attempts = (job.attempts or 0) + 1
                if job.attempts >= MAX_RETRIES:
                    job.status = "failed"
                    job.last_error = f"Processing error: {e}"
                else:
                    job.retry_after = datetime.now(timezone.utc) + timedelta(minutes=1)
            
            finally:
                session.commit()

    except Exception as e:
        print(f"[CRITICAL] Database error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    print("🎯 Thermal Printer Worker Started")
    print("📋 Polling every 5 seconds for print jobs...")
    print("🖨️  Ready to print to configured stations")
    print("-" * 50)
    
    while True:
        try:
            process_jobs()
        except KeyboardInterrupt:
            print("\n🛑 Worker stopped by user")
            break
        except Exception as e:
            print(f"[CRITICAL] Unexpected error in main loop: {e}")
        
        time.sleep(5)