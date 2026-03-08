import os

from app.pos_app import create_pos_app
from app.workers.PrintWorker import start_embedded_print_worker

app = create_pos_app()

if __name__ == "__main__":
    should_start_print_worker = not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if should_start_print_worker:
        start_embedded_print_worker(app.config["SQLALCHEMY_DATABASE_URI"])
    app.run(host="0.0.0.0", port=5000, debug=True)
