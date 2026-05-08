"""Azure AD credential and bearer-token-provider singletons.

We construct ``DefaultAzureCredential`` exactly once and reuse a single bearer
token provider across all LLM and Document Intelligence calls. Per the
constraints (Azure Authentication #4) we MUST NOT re-issue tokens per call.
"""

from __future__ import annotations

from collections.abc import Callable

# These imports are deferred inside the accessor functions so that the test
# suite can run without ``azure-identity`` installed. Real runtime always has
# the package via requirements.txt.

_credential = None
_token_provider: Callable[[], str] | None = None


def get_credential():
    """Return the cached :class:`DefaultAzureCredential` instance.

    Returns:
        A ``DefaultAzureCredential`` instance.

    Raises:
        ImportError: If ``azure.identity`` is not installed.
    """

    global _credential
    if _credential is None:
        from azure.identity import DefaultAzureCredential

        # why: do NOT pin a single auth method (constraint #1). The chain
        # accepts managed identity, env, CLI, etc. and Domino selects whichever
        # is available.
        _credential = DefaultAzureCredential()
    return _credential


def get_token_provider() -> Callable[[], str]:
    """Return a cached bearer-token provider scoped for cognitive services.

    The same callable is reused by every LLM construction, so there is exactly
    one token cache per process.
    """

    global _token_provider
    if _token_provider is None:
        from azure.identity import get_bearer_token_provider

        _token_provider = get_bearer_token_provider(
            get_credential(),
            "https://cognitiveservices.azure.com/.default",
        )
    return _token_provider


def credential_chain_name() -> str:
    """Human-readable name of the credential chain.

    Used by ``/api/health`` so operators can quickly confirm we're using AAD.
    """

    return "DefaultAzureCredential"


def reset_for_tests() -> None:
    """Drop cached credential state. Tests only."""

    global _credential, _token_provider
    _credential = None
    _token_provider = None
