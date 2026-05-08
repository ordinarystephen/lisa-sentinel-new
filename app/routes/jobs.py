"""Job status / cancellation routes.

The frontend polls ``GET /api/jobs/<job_id>/status`` every second while a
job is running. ``POST /api/jobs/<job_id>/cancel`` requests cancellation
(best-effort — the worker checks the flag between iterations).
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from app.services import jobs as jobs_service

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


@bp.get("/<job_id>/status")
def status(job_id: str):
    """Return the current status of ``job_id``, or 404 if unknown."""

    payload = jobs_service.status(job_id)
    if payload is None:
        return jsonify({"error": "not_found", "job_id": job_id}), 404
    return jsonify(payload)


@bp.post("/<job_id>/cancel")
def cancel(job_id: str):
    """Request best-effort cancellation. 404 if the job is unknown."""

    if not jobs_service.cancel(job_id):
        return jsonify({"error": "not_found", "job_id": job_id}), 404
    return jsonify({"cancelled": True, "job_id": job_id})
