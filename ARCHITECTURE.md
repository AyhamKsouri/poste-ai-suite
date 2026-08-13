# Architecture

Orientation doc for a reviewer who's never seen this repo before — a teammate
picking up the project, or a client evaluating it. For setup/demo instructions
see `README.md`; this covers how the pieces fit together and why.

## What the AI actually is (read this first)

**Complaint classification is an LLM call with a keyword-heuristic mock
fallback — not a trained ML model.** There is no classifier that was trained
on this app's own complaint data, no confusion matrix, no F1 score to
retrain against. Both AI features (the RAG assistant and complaint triage)
work the same way: a prompt sent to a hosted LLM (Groq, model
`openai/gpt-oss-120b`), with a fully deterministic, keyword-matching fallback
used whenever no API key is configured or the API call fails. This matters
for anyone extending the "AI Suite" — improving quality means editing prompts
in `backend/app/services/ai_client.py`, not retraining a model.

## Request flow

### Assistant IA (RAG)

1. Employee asks a question in the UI (`frontend/src/pages/Assistant.jsx`),
   sending the full conversation history with it so follow-ups are understood
   in context.
2. `POST /rag/ask` (`backend/app/routers/rag.py`) retrieves the top 4
   matching document chunks via `vectorstore.query()`
   (`backend/app/services/vectorstore.py`) — TF-IDF + cosine similarity over
   all uploaded procedure documents, no embedding model needed. Below a
   minimum similarity threshold, or if two candidate chunks are near-duplicate
   text, retrieval backs off (returns nothing, or skips the duplicate) rather
   than forcing in a bad match.
3. The retrieved chunks + conversation history are sent to
   `answer_question()` in `ai_client.py`, which calls Groq with a system
   prompt that forbids answering from anything outside the provided chunks.
4. The answer, its source chunks, and timing are logged to the `Question`
   table and returned to the frontend with citations.

### Triage des réclamations

1. An agent submits a raw complaint (`frontend/src/pages/Complaints.jsx`) via
   `POST /complaints` (`backend/app/routers/complaints.py`).
2. The complaint is inserted immediately (`status="new"`), then classified
   synchronously in the same request via `classify_complaint()` in
   `ai_client.py` — categories (a complaint can have more than one), urgency,
   a confidence score, a summary, and a draft reply, all as one structured
   (JSON-schema-constrained) Groq call. Status flips to `"reviewed"`.
3. An agent reviews the AI draft in `ComplaintDetail.jsx`, edits it if needed,
   and sends it via `PATCH /complaints/{id}/reply`. This is the human-in-the-
   loop point — AI drafts are never sent automatically.
4. Once replied, the complaint is **locked**: the backend rejects a second
   `/reply` or `/status` change with `409 Conflict`. Complaints are visible to
   every agent (a shared queue, by design), so this lock is what stops two
   agents from acting on the same ticket at once.

## The mock-fallback contract

`settings.ai_enabled` (`backend/app/config.py`) is `True` whenever
`GROQ_API_KEY` is non-empty. When it's `False`, or a live Groq call fails for
any reason (network error, timeout, content filter, invalid response), every
AI function in `ai_client.py` falls back to a deterministic, keyword-matching
mock instead of raising — a Groq outage should never turn into a 500. Each
Groq call gets one immediate retry before falling back, so a single transient
blip doesn't unnecessarily downgrade a response's quality.

This means the whole app is demoable **offline, with zero setup** — no API
key needed. Set `GROQ_API_KEY` in `backend/.env` (free tier at
console.groq.com) to switch to real model responses.

## Running the project

**Without Docker** (native, as documented in `README.md`): Python 3.12 +
`pip install -r backend/requirements.txt` for the backend, Node + `npm
install` for the frontend, `backend/.env` copied from
`backend/.env.example`.

**With Docker**: `docker-compose up` from the repo root (after copying
`backend/.env.example` to `backend/.env`) starts both services with hot
reload, mirroring the native dev workflow — not a production deployment (no
nginx/static build, no process manager). Ports: backend on `:8000`, frontend
on `:5173`.

**Running the test suite**: `pip install -r backend/requirements.txt -r
backend/requirements-dev.txt`, then `pytest tests/` from the repo root
(`tests/conftest.py` adds `backend/` to `sys.path` itself, so this works
without installing the backend as a package). CI (`.github/workflows/ci.yml`)
runs this on every push/PR, plus frontend lint/build and `pip-audit`.

## Database migrations (Alembic)

Schema changes are tracked in `backend/migrations/`. Two things stay true
simultaneously:

- **A brand-new DB** (no file yet) gets its schema from
  `Base.metadata.create_all()` on app startup (`backend/app/main.py`,
  unchanged from before Alembic existed here) — zero-friction for a fresh
  clone. Alembic then stamps that fresh DB to `"head"` automatically so it
  doesn't try to re-run migrations against it later.
- **An existing DB that predates Alembic** (e.g. a local `backend/data/
  poste.db` from before this migration setup was added) is *not*
  auto-stamped — the app logs a warning on startup instead. Run this once
  from `backend/`:

  ```
  alembic upgrade head
  ```

  This applies the real migrations (currently: a baseline no-op, then the
  complaint multi-label `categories` migration, which backfills each existing
  complaint's old single `category` into a `categories` list rather than
  dropping data). The Docker backend image runs this automatically on
  container start if a DB file is already present.

Going forward: after changing a model in `backend/app/models.py`, generate a
migration with `alembic revision --autogenerate -m "..."` from `backend/`,
check the generated file (SQLite needs Alembic's batch mode for
`ALTER`/`DROP COLUMN`, already configured in `migrations/env.py`), then
`alembic upgrade head`.

## Directory structure

```
backend/
  app/
    routers/        # auth, rag, complaints - one file per resource
    services/
      ai_client.py   # all Groq calls + prompts + mock fallbacks live here
      vectorstore.py # TF-IDF retrieval index
      documents.py   # PDF/DOCX/TXT extraction + chunking
    models.py        # SQLAlchemy models
    schemas.py        # Pydantic request/response models
    config.py         # env-driven Settings
  migrations/        # Alembic
  requirements.txt       # runtime deps
  requirements-dev.txt   # test/CI-only deps (pytest, pip-audit, ...)
frontend/
  src/
    pages/           # one file per route (Assistant, Complaints, Dashboard, ...)
    api/client.js     # single fetch wrapper, all backend calls go through it
    constants.js       # shared label/style maps for complaint fields
tests/               # backend pytest suite (runs from repo root)
docs/audit/          # the original QA/security audit's full writeup + evidence
```
