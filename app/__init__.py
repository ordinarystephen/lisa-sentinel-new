"""Flask application factory.

Stage 1 reshape: the app is now an API server plus a single SPA-serving
catch-all. The previous Jinja-rendered shell is gone — Vite's build output
in ``frontend/dist`` becomes the UI from Stage 2.

Loads config at import time (in :mod:`app.config`), wires the JSON logger,
registers blueprints, and returns the Flask app. Tests and the ``run.py``
entry point share this factory.
"""

from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask

from app.config import get_settings
from app.utils.logging import configure_logging

_log = logging.getLogger(__name__)


def create_app() -> Flask:
    """Build and configure the Flask app."""

    settings = get_settings()
    configure_logging(settings.log_level)

    # why: the SPA build provides static assets directly; Flask's default
    # ``static_folder`` would collide with the catch-all SPA route. Disable
    # the built-in static handler entirely.
    app = Flask(__name__, static_folder=None, template_folder=None)
    app.config["JSON_SORT_KEYS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB upload cap

    _register_api_blueprints(app)
    _register_spa(app)

    _log.info(
        "app_created",
        extra={
            "parser": settings.memo_pdf_parser,
            "log_level": settings.log_level,
            "frontend_dist": str(Path(app.root_path).parent / "frontend" / "dist"),
        },
    )
    return app


def _register_api_blueprints(app: Flask) -> None:
    """Register every blueprint with an ``/api/`` prefix.

    Order matters in one regard: the SPA catch-all is registered last so
    these API blueprints win the route match for ``/api/...`` paths.
    """

    from app.routes import dev as dev_routes
    from app.routes import documents, extraction, health, jobs, prompts

    app.register_blueprint(health.bp)
    app.register_blueprint(documents.bp)
    app.register_blueprint(extraction.bp)
    app.register_blueprint(prompts.bp)
    app.register_blueprint(jobs.bp)
    app.register_blueprint(dev_routes.bp)


def _register_spa(app: Flask) -> None:
    """Mount the SPA catch-all last."""

    from app.routes import spa

    app.register_blueprint(spa.bp)
