"""LLM factory and LangGraph singleton.

Why a module-level cached graph:
    Per LLM Construction Pattern: the graph is built once and reused. We
    expose :func:`invalidate_graph` so callers can force a rebuild after a
    config change without restarting the process.

The graph here is intentionally minimal — extraction/QA/scenario each compose
their own chain on top of the shared LLM. We keep a single ``StateGraph`` so
later work can hang nodes off it (memory, tracing, checkpointing).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.config import get_settings

from .azure_auth import get_token_provider

_log = logging.getLogger(__name__)
_graph: Any = None


def make_llm(temperature: float = 0.0):
    """Construct an :class:`AzureChatOpenAI` configured against the team's tenant.

    Args:
        temperature: Sampling temperature. Default ``0.0`` for deterministic
            extraction; QA and scenario nodes can opt up if they want.

    Returns:
        A ready-to-use ``AzureChatOpenAI`` instance.

    Raises:
        ImportError: If ``langchain_openai`` is not installed.
    """

    from langchain_openai import AzureChatOpenAI

    settings = get_settings()
    return AzureChatOpenAI(
        azure_endpoint=settings.azure_openai_endpoint or None,
        azure_deployment=settings.azure_openai_deployment,
        api_version=settings.openai_api_version,
        azure_ad_token_provider=get_token_provider(),
        temperature=temperature,
    )


def make_embeddings():
    """Construct an :class:`AzureOpenAIEmbeddings` against the embeddings deployment.

    Returns:
        A ready-to-use ``AzureOpenAIEmbeddings`` instance.

    Raises:
        ImportError: If ``langchain_openai`` is not installed.
        RuntimeError: If ``AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT`` is not set.
    """

    from langchain_openai import AzureOpenAIEmbeddings

    settings = get_settings()
    deployment = settings.azure_openai_embeddings_deployment or os.getenv(
        "AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT", ""
    )
    if not deployment:
        raise RuntimeError(
            "AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT is not set; cannot construct embeddings client"
        )
    return AzureOpenAIEmbeddings(
        azure_endpoint=settings.azure_openai_endpoint or None,
        azure_deployment=deployment,
        api_version=settings.openai_api_version,
        azure_ad_token_provider=get_token_provider(),
    )


def get_graph():
    """Return the cached LangGraph instance, building it on first access."""

    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


def invalidate_graph() -> None:
    """Drop the cached LangGraph so the next ``get_graph`` rebuilds it.

    Call after a config change that affects how nodes are wired (e.g. a new
    parser is chosen and the graph carries parser-specific state).
    """

    global _graph
    _graph = None


def _build_graph() -> Any:
    """Construct the project's LangGraph.

    The graph is intentionally light in v1: a single passthrough node that lets
    the rest of the app start before LangGraph orchestration is fleshed out.
    Extraction/QA/scenario services each compose their own chains on top of
    :func:`make_llm`. We keep this in place so the cache contract holds and so
    future work can hang nodes off the same graph.
    """

    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError:
        # why: in environments where langgraph isn't yet installed (tests),
        # keep the graph as a sentinel object rather than crashing on import.
        _log.warning("langgraph_unavailable", extra={"reason": "import_failed"})
        return object()

    # Minimal state schema — a dict keyed by string. Nodes can extend.
    graph = StateGraph(dict)

    def _passthrough(state: dict[str, Any]) -> dict[str, Any]:
        return state

    graph.add_node("passthrough", _passthrough)
    graph.add_edge(START, "passthrough")
    graph.add_edge("passthrough", END)
    return graph.compile()
