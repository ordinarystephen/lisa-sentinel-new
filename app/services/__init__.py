"""Service layer — Azure auth, LLM, parsers, extraction, embeddings, jobs, storage.

Each module is independently importable. The Flask routes (``app/routes/``)
delegate all real work down here so the HTTP layer stays thin.
"""
