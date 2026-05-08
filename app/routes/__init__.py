"""HTTP routes — one blueprint per concern (system endpoints + API surfaces).

Stage 1 reshaped the route tree to match the React SPA: every API surface
lives under ``/api/...`` and a single catch-all blueprint serves the SPA
build for everything else. The thin-wrapper rule still holds — anything
non-trivial belongs in ``app/services/``.
"""
