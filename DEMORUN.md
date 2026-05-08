# Lisa-Sentinel — Quick Run

Fastest path to a running app. For full setup details, env vars, and troubleshooting, see [DEMO.md](DEMO.md).

## Pre-reqs

Python 3.11+, Node 18+, `pip`, `npm`, `az` CLI (for Azure auth).

## Local development (with hot reload)

Two terminals.

**Terminal 1 — Flask backend:**
```bash
cd <repo>
make install
python run.py
```
Backend runs on `http://localhost:5000`.

**Terminal 2 — Vite frontend:**
```bash
cd <repo>/frontend
npm run dev
```
Open the app at `http://localhost:5173`.

## Local production-like (single process)

```bash
cd <repo>
make install
make build
python run.py
```
Open the app at `http://localhost:5000`.

## Domino

```bash
cd /mnt/<project>/lisa-sentinel
make install
make build
python run.py
```
Open the app at `https://<domino-domain>/proxy/<port>/`.

## Health check (run this first)

```bash
curl -s http://localhost:5000/api/health | python -m json.tool
```

Good output: `status: "ok"`, `doc_store.writable: true`, `env_missing: []`, `parsers["docintel-official"]: "available"`.
