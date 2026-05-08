#!/usr/bin/env python3
"""Connectivity + dependency probe.

Run via ``make check-env`` or ``python scripts/check_environment.py``.

The probe is read-only — it reports what is reachable and what is missing.
It does NOT call Azure live; it just verifies that the SDKs import and the
required environment variables look populated.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

# why: keep the repo importable without an install.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _check(label: str, fn) -> int:
    try:
        result = fn()
        print(f"OK   {label}: {result}")
        return 0
    except Exception as exc:  # noqa: BLE001 - we want all errors here
        print(f"FAIL {label}: {exc}")
        return 1


def check_python() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def check_required_env() -> str:
    from app.config import get_settings

    settings = get_settings()
    missing = settings.env_missing()
    if missing:
        raise RuntimeError(f"missing required env: {missing}")
    return ", ".join(settings.env_present())


def check_imports(modules: list[str]) -> str:
    failed = []
    for name in modules:
        try:
            importlib.import_module(name)
        except ImportError as exc:
            failed.append(f"{name} ({exc})")
    if failed:
        raise RuntimeError("import failures: " + "; ".join(failed))
    return "ok"


def check_doc_store() -> str:
    from app.services import doc_store

    health = doc_store.doc_store_health()
    if not health["writable"]:
        raise RuntimeError(f"doc store not writable at {health['path']}")
    return f"{health['path']} ({health['document_count']} document(s))"


def check_page_rendering() -> str:
    from app.services import doc_store

    return "ok" if doc_store.page_rendering_available() else "unavailable (poppler missing)"


def check_parsers() -> str:
    from app.services.parsers import probe_capabilities

    caps = probe_capabilities()
    parts = []
    for name, cap in caps.items():
        parts.append(f"{name}={'ok' if cap.available else cap.reason or 'no'}")
    return "; ".join(parts)


def main() -> int:
    print("Lisa-Sentinel environment probe")
    print("-" * 40)
    failures = 0
    failures += _check("python", check_python)
    failures += _check(
        "imports",
        lambda: check_imports([
            "flask",
            "dotenv",
            "azure.identity",
            "azure.ai.documentintelligence",
            "langchain",
            "langchain_openai",
            "langgraph",
            "pypdf",
            "openpyxl",
        ]),
    )
    failures += _check("doc store", check_doc_store)
    failures += _check("page rendering", check_page_rendering)
    failures += _check("parsers", check_parsers)
    failures += _check("env vars", check_required_env)
    print("-" * 40)
    print(f"{'OK' if failures == 0 else 'FAIL'} ({failures} issue(s))")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
