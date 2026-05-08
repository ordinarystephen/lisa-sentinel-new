"""SPA serving route.

The React SPA is built into ``frontend/dist/`` (Stage 2). This route serves
``index.html`` for every non-API path so the SPA's client-side router takes
over. Static assets that exist in the build directory are served as-is.

Stage 1 leaves ``frontend/dist/`` empty; we serve a tiny placeholder until
``npm run build`` runs in the frontend project.
"""

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, send_from_directory

bp = Blueprint("spa", __name__)

_PLACEHOLDER_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Lisa-Sentinel</title>
    <style>
      body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
             max-width: 720px; margin: 64px auto; padding: 0 24px; color: #1a1a1a; }
      h1 { font-size: 22px; margin-bottom: 8px; }
      p { color: #5a5a5a; line-height: 1.5; }
      code { background: #f7f7f5; padding: 2px 6px; border-radius: 2px; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Lisa-Sentinel — backend ready</h1>
    <p>The Stage 1 backend reshape is in place. The React frontend has not
       been built yet.</p>
    <p>To bring the UI online: run <code>npm install &amp;&amp; npm run build</code>
       inside the <code>frontend/</code> project and reload this page. The
       API is live at <code>/api/health</code>.</p>
  </body>
</html>
"""


def _build_dir() -> Path:
    return Path(current_app.root_path).parent / "frontend" / "dist"


@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve_spa(path: str):
    """Serve the SPA build, falling back to ``index.html`` for client-side routes."""

    build_dir = _build_dir()
    # Don't intercept API paths — registered blueprints handle them. The
    # catch-all route is registered after the API blueprints in
    # ``app/__init__.py`` so this branch is defensive only.
    if path.startswith("api/"):
        return ("", 404)

    if not build_dir.exists():
        return _PLACEHOLDER_HTML, 200, {"Content-Type": "text/html; charset=utf-8"}

    if path:
        candidate = build_dir / path
        if candidate.is_file():
            return send_from_directory(build_dir, path)

    index = build_dir / "index.html"
    if index.is_file():
        return send_from_directory(build_dir, "index.html")
    return _PLACEHOLDER_HTML, 200, {"Content-Type": "text/html; charset=utf-8"}
