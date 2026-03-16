import logging
import os
import socket
import threading
import time
from datetime import timedelta

from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import and_, create_engine, or_
from sqlalchemy.orm import sessionmaker

from app.models.models import BrandingSettings, OrderItem, PrintJob, Station
from app.utils.timezone import eat_now, eat_now_naive

LOGGER = logging.getLogger("print_worker")
logging.basicConfig(level=logging.INFO)
load_dotenv()

_worker_thread = None


def _build_database_uri_from_env() -> str | None:
    explicit_uri = os.environ.get("SQLALCHEMY_DATABASE_URI") or os.environ.get("DATABASE_URI")
    if explicit_uri:
        return explicit_uri

    db_user = os.environ.get("DB_USER")
    db_password = os.environ.get("DB_PASSWORD")
    db_host = os.environ.get("DB_HOST")
    db_port = os.environ.get("DB_PORT")
    db_name = os.environ.get("DB_NAME")
    if all([db_user, db_password, db_host, db_port, db_name]):
        return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    return None


def start_embedded_print_worker(database_uri: str) -> threading.Thread:
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return _worker_thread

    worker = PrintWorker(
        database_uri=database_uri,
        check_interval_seconds=int(os.environ.get("PRINT_CHECK_INTERVAL_SECONDS", "2")),
        max_retries=int(os.environ.get("PRINT_MAX_RETRIES", "2")),
        retry_delay_seconds=int(os.environ.get("PRINT_RETRY_DELAY_SECONDS", "60")),
        default_printer_ip=os.environ.get("DEFAULT_PRINTER_IP", "127.0.0.1"),
    )
    thread = threading.Thread(target=worker.run_forever, name="print-worker", daemon=True)
    thread.start()
    _worker_thread = thread
    return thread


class PrintWorker:
    def __init__(
        self,
        database_uri: str,
        *,
        font_path: str | None = None,
        logo_path: str | None = None,
        printer_width_px: int = 576,
        check_interval_seconds: int = 2,
        max_retries: int = 2,
        retry_delay_seconds: int = 60,
        default_printer_ip: str = "127.0.0.1",
    ):
        if not database_uri:
            raise ValueError("database_uri is required")

        self.database_uri = database_uri
        self.printer_width_px = printer_width_px
        self.check_interval_seconds = check_interval_seconds
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds
        self.default_printer_ip = default_printer_ip

        base_dir = os.path.dirname(__file__)
        self.font_path = font_path or os.path.join(base_dir, "NotoSansEthiopic.ttf")
        self.logo_path = logo_path or os.path.join(base_dir, "TNS.png")

        self.engine = create_engine(self.database_uri, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    @classmethod
    def from_env(cls):
        database_uri = _build_database_uri_from_env()
        return cls(
            database_uri=database_uri,
            check_interval_seconds=int(os.environ.get("PRINT_CHECK_INTERVAL_SECONDS", "2")),
            max_retries=int(os.environ.get("PRINT_MAX_RETRIES", "2")),
            retry_delay_seconds=int(os.environ.get("PRINT_RETRY_DELAY_SECONDS", "60")),
            default_printer_ip=os.environ.get("DEFAULT_PRINTER_IP", "127.0.0.1"),
        )

    def load_font(self, size=24):
        try:
            return ImageFont.truetype(self.font_path, size)
        except Exception:
            return ImageFont.load_default()

    def _line_height(self, font, extra_spacing=4):
        bbox = font.getbbox("A")
        return bbox[3] - bbox[1] + extra_spacing

    def _load_logo(self):
        if not os.path.exists(self.logo_path):
            return None
        try:
            return Image.open(self.logo_path).convert("1")
        except Exception:
            LOGGER.warning("Failed to load logo from %s", self.logo_path, exc_info=True)
            return None

    def _normalize_items(self, job: PrintJob):
        payload = job.items_data if isinstance(job.items_data, dict) else {}
        raw_items = payload.get("items", [])
        if not isinstance(raw_items, list):
            raw_items = []
        return [item for item in raw_items if isinstance(item, dict)]

    def _draw_aligned(self, draw, y, text, font, anchor="left", margin=10):
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        if anchor == "center":
            x = max((self.printer_width_px - text_width) // 2, 0)
        elif anchor == "right":
            x = max(self.printer_width_px - text_width - margin, 0)
        else:
            x = margin
        draw.text((x, y), text, font=font, fill=0)

    def _paste_logo(self, image, y_offset):
        logo = self._load_logo()
        if logo is None:
            return image
        logo_width = min(int(logo.width * 0.5), self.printer_width_px // 2)
        logo_height = int(logo.height * logo_width / logo.width)
        resized_logo = logo.resize((logo_width, logo_height))
        output = Image.new("1", (self.printer_width_px, image.height + logo_height + y_offset + 20), 1)
        output.paste(image, (0, 0))
        output.paste(resized_logo, ((self.printer_width_px - resized_logo.width) // 2, image.height + y_offset))
        return output

    def _render_cashier_ticket(self, job: PrintJob, items: list[dict], payload: dict):
        font_header = self.load_font(36)
        font_regular = self.load_font(28)
        header_line_height = self._line_height(font_header)
        line_height = self._line_height(font_regular)

        lines = [
            ("Order Receipt", font_header, "center"),
            ("---- Non Fiscal ----", font_header, "center"),
            ("-" * 45, font_header, "center"),
            (f"ORDER #: {job.order_id}", font_regular, "left"),
            (f"DATE: {eat_now().strftime('%Y-%m-%d %H:%M:%S')}", font_regular, "left"),
            (f"WAITER: {payload.get('waiter', 'Unknown')}", font_regular, "left"),
            (f"TABLE: {payload.get('table', 'N/A')}", font_regular, "left"),
            ("-" * 92, font_regular, "center"),
        ]

        subtotal = 0.0
        item_rows = []
        for item in items:
            qty = float(item.get("quantity", 1) or 1)
            price = float(item.get("price", 0.0) or 0.0)
            total = qty * price
            subtotal += total
            item_rows.append((str(item.get("name", "")), f"{qty:g} x {price:.2f}", f"{total:.2f}"))

        footer_lines = [
            ("-" * 92, font_regular, "center"),
            (f"TOTAL: {float(payload.get('total', subtotal)):.2f}ETB ", font_regular, "right"),
            ("THANK YOU!", font_regular, "center"),
        ]

        height = (
            sum(header_line_height if font == font_header else line_height for _, font, _ in lines)
            + ((len(item_rows) + 2) * (line_height + 5))
            + sum(line_height + 5 for _ in footer_lines)
            + 120
        )

        image = Image.new("1", (self.printer_width_px, height), 1)
        draw = ImageDraw.Draw(image)
        y = 10

        for text, font, anchor in lines:
            self._draw_aligned(draw, y, text, font, anchor=anchor)
            y += (header_line_height if font == font_header else line_height) + 5

        col_item_x = 10
        col_qty_x = 260
        col_total_x = 480

        draw.text((col_item_x, y), "Item", font=font_regular, fill=0)
        draw.text((col_qty_x, y), "Qty x Price", font=font_regular, fill=0)
        draw.text((col_total_x, y), "Total", font=font_regular, fill=0)
        y += line_height + 5
        draw.line((10, y, self.printer_width_px - 10, y), fill=0)
        y += 5

        for name, qty_price, total in item_rows:
            draw.text((col_item_x, y), name[:28], font=font_regular, fill=0)
            draw.text((col_qty_x, y), qty_price, font=font_regular, fill=0)
            draw.text((col_total_x, y), total, font=font_regular, fill=0)
            y += line_height + 5

        for text, font, anchor in footer_lines:
            self._draw_aligned(draw, y, text, font, anchor=anchor)
            y += line_height + 5

        cropped = image.crop((0, 0, self.printer_width_px, min(max(y + 20, 80), height)))
        return self._paste_logo(cropped, 10)

    def _render_station_ticket(self, job: PrintJob, items: list[dict], payload: dict):
        font_regular = self.load_font(28)
        font_bold = self.load_font(36)
        line_height = self._line_height(font_regular)
        bold_line_height = self._line_height(font_bold)

        lines = []
        prep_tag = next((str(item.get("prep_tag")) for item in items if item.get("prep_tag")), None)
        if prep_tag:
            lines.append(prep_tag)

        lines.append(f"Order ID: {job.order_id}")
        lines.append(f"Time: {eat_now().strftime('%H:%M:%S')}")
        lines.append(f"Waiter: {payload.get('waiter', 'Unknown')}  Table: {payload.get('table', 'N/A')}")
        lines.append("." * 32)

        for item in items:
            lines.append(f"{item.get('quantity', 1)}x {str(item.get('name', ''))[:24]}")
            if item.get("notes"):
                lines.append(f"Notes: {item['notes']}")

        lines.append("." * 32)
        lines.append("Thank you!")

        bold_values = set()
        if prep_tag:
            bold_values.add(prep_tag)

        height = sum(bold_line_height if line in bold_values else line_height for line in lines) + 60
        image = Image.new("1", (self.printer_width_px, height), 1)
        draw = ImageDraw.Draw(image)
        y = 10

        for line in lines:
            font = font_bold if line in bold_values else font_regular
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (self.printer_width_px - text_width) // 2 if text_width < self.printer_width_px else 0
            draw.text((x, y), line, font=font, fill=0)
            y += bold_line_height if font == font_bold else line_height

        cropped = image.crop((0, 0, self.printer_width_px, min(max(y + 20, 80), height)))
        return self._paste_logo(cropped, 10)

    def render_ticket(self, job: PrintJob, items: list[dict]):
        payload = job.items_data if isinstance(job.items_data, dict) else {}
        if job.type == "cashier":
            return self._render_cashier_ticket(job, items, payload)
        return self._render_station_ticket(job, items, payload)

    def is_printer_reachable(self, ip, port=9100, timeout=2):
        try:
            with socket.create_connection((ip, port), timeout=timeout):
                return True
        except OSError:
            return False

    def print_ticket_image(self, printer_ip, image):
        from escpos.printer import Network

        if not printer_ip:
            return False, "Printer IP is empty"
        if not self.is_printer_reachable(printer_ip):
            return False, f"Printer {printer_ip} is unreachable"

        printer = None
        try:
            printer = Network(printer_ip, port=9100, timeout=10)
            printer.profile.profile_data["media"] = {
                "width": {"pixel": self.printer_width_px},
                "height": {"pixel": image.height},
            }
            printer.image(image)
            printer.cut()
            return True, None
        except Exception as exc:
            return False, str(exc)
        finally:
            if printer is not None:
                try:
                    printer.close()
                except Exception:
                    pass

    def fetch_next_job(self, session):
        now = eat_now_naive()
        job = (
            session.query(PrintJob)
            .filter(
                and_(
                    PrintJob.status == "pending",
                    or_(PrintJob.retry_after.is_(None), PrintJob.retry_after <= now),
                )
            )
            .order_by(PrintJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if job is None:
            return None

        job.status = "in_progress"
        job.error_message = None
        session.commit()
        LOGGER.info("Locked print job %s", job.id)
        return job

    def _mark_failure(self, session, job: PrintJob, message: str):
        job.attempts = int(job.attempts or 0) + 1
        job.error_message = message
        if job.attempts >= self.max_retries:
            job.status = "failed"
            job.retry_after = None
        else:
            job.status = "pending"
            job.retry_after = eat_now_naive() + timedelta(seconds=self.retry_delay_seconds)

    def process_job(self, job_id: int):
        session = self.Session()
        try:
            job = session.get(PrintJob, job_id)
            if job is None or job.status != "in_progress":
                return

            items = self._normalize_items(job)
            if not items:
                self._mark_failure(session, job, "No printable items in payload")
                session.commit()
                return

            station = session.get(Station, job.station_id) if job.station_id else None
            printer_ip = station.printer_identifier if station and station.printer_identifier else self.default_printer_ip

            image = self.render_ticket(job, items)
            if self._is_preview_enabled(session):
                self._show_preview(image, job.id)
            success, error_message = self.print_ticket_image(printer_ip, image)

            if success:
                job.status = "printed"
                job.printed_at = eat_now_naive()
                job.retry_after = None
                job.error_message = None
                for item in items:
                    item_id = item.get("item_id")
                    if item_id:
                        order_item = session.get(OrderItem, item_id)
                        if order_item:
                            order_item.status = "ready"
            else:
                self._mark_failure(session, job, error_message or "Printing failed")

            session.commit()
        except Exception as exc:
            session.rollback()
            LOGGER.exception("Unhandled print-job processing error for job %s: %s", job_id, exc)
            session = self.Session()
            try:
                job = session.get(PrintJob, job_id)
                if job and job.status == "in_progress":
                    self._mark_failure(session, job, str(exc))
                    session.commit()
            finally:
                session.close()
            return
        finally:
            session.close()

    def _is_preview_enabled(self, session) -> bool:
        settings = session.get(BrandingSettings, 1)
        return bool(settings and settings.print_preview_enabled)

    def _show_preview(self, image: Image.Image, job_id: int):
        try:
            image.show(title=f"Job {job_id} Preview")
        except Exception as exc:
            LOGGER.warning("Unable to show print preview for job %s: %s", job_id, exc)

    def run_forever(self):
        LOGGER.info("Print worker started")
        while True:
            session = self.Session()
            try:
                job = self.fetch_next_job(session)
            except Exception:
                LOGGER.exception("Failed to fetch pending print job")
                job = None
            finally:
                session.close()

            if job is None:
                time.sleep(self.check_interval_seconds)
                continue

            self.process_job(job.id)
            time.sleep(1)


if __name__ == "__main__":
    PrintWorker.from_env().run_forever()
