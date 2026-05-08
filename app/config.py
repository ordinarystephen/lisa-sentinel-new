"""Application configuration — env loading and a typed settings dataclass.

Domino injects environment variables at runtime that must take precedence over
local ``.env`` values. We therefore load ``.env`` with ``override=False`` so
existing process env wins.

The :class:`Settings` dataclass is the single source of truth for runtime
configuration. Modules import :func:`get_settings` rather than reading
``os.environ`` directly, which keeps env coupling explicit and testable.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# why: load BEFORE any service module reads env. ``override=False`` so Domino
# wins over .env (per CONSTRAINTS.md).
_ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)
# Some deployments place ``.env`` next to ``run.py`` rather than inside ``app/``;
# check the parent too without overriding either source.
_ROOT_ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_ROOT_ENV_PATH, override=False)


# Default Azure OpenAI endpoint for the team's tenant. Empty here — surface as
# missing in /api/health when unset and no team default is wired.
DEFAULT_AZURE_OPENAI_ENDPOINT = ""

DEFAULT_DOCINTEL_API_VERSION = "2024-11-30"
DEFAULT_PARSER = "docintel-official"
SUPPORTED_PARSERS = (
    "docintel-official",
    "pypdf",
    "docintel-risklab",
    "ocr-fallback",
)


def _env(name: str, default: str = "") -> str:
    """Read an env var, treating empty strings as unset.

    Args:
        name: Variable name.
        default: Returned when the var is unset or empty.

    Returns:
        The variable value with surrounding whitespace stripped, or ``default``.
    """

    raw = os.getenv(name, "")
    if raw is None:
        return default
    raw = raw.strip()
    return raw if raw else default


def _env_int(name: str, default: int) -> int:
    """Read an env var as int, falling back to ``default`` on parse failure."""

    raw = _env(name, "")
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    """Runtime configuration snapshot.

    Frozen so consumers can cache it without worrying about mutation.
    """

    # Azure OpenAI
    azure_openai_endpoint: str
    azure_openai_deployment: str
    openai_api_version: str
    azure_openai_embeddings_deployment: str

    # Azure Document Intelligence
    azure_docintel_endpoint: str
    docintel_api_version: str

    # Parser selection
    memo_pdf_parser: str

    # Logging
    log_dir: str

    # Workers
    pdf_workers: int
    question_workers: int

    # Embeddings
    chunk_size: int
    chunk_overlap: int

    log_level: str

    # Required env var names — used by /api/health to compute env_missing.
    required_env: tuple[str, ...] = field(
        default=(
            "AZURE_OPENAI_DEPLOYMENT",
            "OPENAI_API_VERSION",
            "AZURE_DOCINTEL_ENDPOINT",
        )
    )

    def env_present(self) -> list[str]:
        """Return required env vars that are actually set."""

        return [name for name in self.required_env if _env(name)]

    def env_missing(self) -> list[str]:
        """Return required env vars that are NOT set."""

        return [name for name in self.required_env if not _env(name)]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached :class:`Settings` instance.

    Cached so repeated reads avoid re-stripping/parsing env vars. Tests can
    call :func:`reset_settings_cache` to pick up env changes.
    """

    return Settings(
        azure_openai_endpoint=_env("AZURE_OPENAI_ENDPOINT", DEFAULT_AZURE_OPENAI_ENDPOINT),
        azure_openai_deployment=_env("AZURE_OPENAI_DEPLOYMENT"),
        openai_api_version=_env("OPENAI_API_VERSION"),
        azure_openai_embeddings_deployment=_env("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT"),
        azure_docintel_endpoint=_env("AZURE_DOCINTEL_ENDPOINT"),
        docintel_api_version=_env("DOCINTEL_API_VERSION", DEFAULT_DOCINTEL_API_VERSION),
        memo_pdf_parser=_env("MEMO_PDF_PARSER", DEFAULT_PARSER),
        log_dir=_env("LISA_LOG_DIR", "logging"),
        pdf_workers=_env_int("MEMO_PDF_WORKERS", 4),
        question_workers=_env_int("MEMO_QUESTION_WORKERS", 4),
        chunk_size=_env_int("MEMO_CHUNK_SIZE", 1500),
        chunk_overlap=_env_int("MEMO_CHUNK_OVERLAP", 200),
        log_level=_env("LISA_LOG_LEVEL", "INFO").upper(),
    )


def reset_settings_cache() -> None:
    """Drop the cached settings. Test-only helper."""

    get_settings.cache_clear()
