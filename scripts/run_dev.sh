#!/usr/bin/env bash
# Convenience wrapper for local development.
# - exports FLASK_DEBUG=1 so reload + tracebacks are on
# - falls back to a sane port if PORT isn't injected by Domino
set -euo pipefail

export FLASK_DEBUG=1
export PORT="${PORT:-8080}"
export FLASK_RUN_HOST="${FLASK_RUN_HOST:-127.0.0.1}"

python "$(dirname "$0")/../run.py"
