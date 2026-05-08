"""Entrypoint for running the Lisa-Sentinel Flask app.

Use ``python run.py`` (or ``make run`` / ``make dev``).

Why a thin entrypoint:
    * Domino runs the app under its own HTTP proxy and expects a script-style entry.
    * Keeping app construction in ``app.create_app()`` lets tests and Domino share
      the exact same factory without duplicating wiring.
"""

from __future__ import annotations

import os

from app import create_app


def main() -> None:
    """Boot the Flask app and listen on the configured host/port."""

    app = create_app()
    host = os.getenv("FLASK_RUN_HOST", "0.0.0.0")
    # why: Domino injects ``PORT`` for the proxy; fall back to 8080 for local dev.
    port = int(os.getenv("PORT", os.getenv("FLASK_RUN_PORT", "8080")))
    debug = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
