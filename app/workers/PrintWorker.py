import logging
import os
import socket
import time
from datetime import timedelta

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import and_, create_engine, or_
from sqlalchemy.orm import sessionmaker

from app.models.models import BrandingSettings, OrderItem, PrintJob, Station
from app.utils.timezone import eat_now, eat_now_naive

LOGGER = logging.getLogger("print_worker")
logging.basicConfig(level=logging.INFO)


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
        database_uri = (
            os.environ.get("SQLALCHEMY_DATABASE_URI")
            or os.environ.get("DATABASE_URI")
        )
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

    def _normalize_items(self, job: PrintJob):
        payload = job.items_data if isinstance(job.items_data, dict) else {}
        raw_items = payload.get("items", [])
        if not isinstance(raw_items, list):
            raw_items = []
        return [item for item in raw_items if isinstance(item, dict)]

    def _draw_centered(self, draw, y, text, font):
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        x = max((self.printer_width_px - text_width) // 2, 0)
        draw.text((x, y), text, font=font, fill=0)
        return bbox[3] - bbox[1] + 6

    def render_ticket(self, job: PrintJob, items: list[dict]):
        font_header = self.load_font(30)
        font_regular = self.load_font(24)
        font_bold = self.load_font(34)
        payload = job.items_data if isinstance(job.items_data, dict) else {}

        lines: list[tuple[str, ImageFont.FreeTypeFont]] = []
        if job.type == "station":
            lines.append(("ለኩሽና", font_bold))

        prep_tag = next((i.get("prep_tag") for i in items if i.get("prep_tag")), None)
        if prep_tag:
            lines.append((str(prep_tag), font_bold))

        lines.append((f"Order ID: {job.order_id}", font_header))
        lines.append((f"Time: {eat_now().strftime('%Y-%m-%d %H:%M:%S')}", font_regular))
        lines.append((f"Waiter: {payload.get('waiter', 'Unknown')}", font_regular))
        lines.append((f"Table: {payload.get('table', 'N/A')}", font_regular))
        lines.append(("--------------------------------", font_regular))

        if job.type == "cashier":
            total = 0.0
            for item in items:
                qty = float(item.get("quantity", 0))
                price = float(item.get("price", 0.0))
                line_total = qty * price
                total += line_total
                lines.append((f"{qty:g} x {item.get('name', '')}", font_regular))
                lines.append((f"{line_total:.2f} ETB", font_regular))
            lines.append(("--------------------------------", font_regular))
            lines.append((f"Total: {float(payload.get('total', total)):.2f} ETB", font_bold))
        else:
            for item in items:
                qty = item.get("quantity", 1)
                name = item.get("name", "")
                lines.append((f"{qty} x {name}", font_regular))
                notes = item.get("notes")
                if notes:
                    lines.append((f"Notes: {notes}", font_regular))

        lines.append(("Thank you!", font_regular))

        estimated_height = 40 + len(lines) * 42
        image = Image.new("1", (self.printer_width_px, estimated_height), 1)
        draw = ImageDraw.Draw(image)
        y = 10
        for text, font in lines:
            y += self._draw_centered(draw, y, text, font)
        return image.crop((0, 0, self.printer_width_px, min(max(y + 20, 80), estimated_height)))

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
