# Phase 0 — Repository Inventory

Branch: `qa/full-audit` (created from `main` @ `864696d`, clean tree at branch time)
Date: 2026-08-12
Method: static reading only — nothing in this file was executed. Anything marked
with a claim about runtime behavior is a code-reading inference, not a test result,
and must be re-verified in later phases.

---

## 1. Directory tree (depth 3)

```
poste-ai-suite/
├── README.md                        setup/demo instructions, tech stack, roadmap
├── sample_procedure_ccp.txt          the ONLY sample source document for the RAG corpus
├── docs/
│   ├── rapport-avancement.html       progress report (French), not audited here
│   ├── screenshots/                  3 demo screenshots (assistant/complaint/dashboard)
│   └── audit/                        <- this audit's output (new)
├── backend/
│   ├── .env / .env.example           runtime config (see §6)
│   ├── requirements.txt              pinned Python deps (14 packages, see §5)
│   ├── data/
│   │   ├── poste.db                  live SQLite DB, already has demo data (see §7)
│   │   └── uploads/                  1 uploaded file (the sample CCP procedure)
│   └── app/
│       ├── main.py                   FastAPI app, CORS, startup seeding + index build
│       ├── config.py                 pydantic-settings env loader
│       ├── db.py                     SQLAlchemy engine/session
│       ├── models.py                 6 ORM tables
│       ├── schemas.py                Pydantic request/response models
│       ├── auth.py                   JWT + bcrypt auth helpers
│       ├── routers/                  auth.py, rag.py, complaints.py (see §2)
│       └── services/                 ai_client.py, documents.py, vectorstore.py
├── frontend/
│   ├── index.html                    Vite entry, Google Fonts CDN, favicon
│   ├── vite.config.js                dev server + /api proxy to :8000
│   ├── package.json                  React 18 + Vite 5, no TypeScript
│   ├── public/favicon.png            (new, this session)
│   └── src/
│       ├── main.jsx / App.jsx        router root, route guards
│       ├── AuthContext.jsx           auth state, token in localStorage
│       ├── api/client.js             fetch wrapper
│       ├── components/               Layout.jsx, Icon.jsx
│       ├── assets/logo.png           (new, this session)
│       └── pages/                    Login, Assistant, Complaints, ComplaintDetail,
│                                      Dashboard, AdminDocuments (see §3)
└── tests/                            empty — created for this audit
```

No `scripts/`, `Makefile`, `Dockerfile`, `docker-compose.yml`, or `alembic/` anywhere
in the repo (confirmed by search, not just absence from tree above).

---

## 2. Backend endpoints (complete — 15 total)

| Method | Path | Auth | Request schema | Response schema | file:line |
|---|---|---|---|---|---|
| GET | `/` | none | – | `{status, ai_enabled}` (raw dict) | `backend/app/main.py:61` |
| POST | `/auth/register` | **admin** | `UserCreate` | `UserOut` | `backend/app/routers/auth.py:12` |
| POST | `/auth/login` | none | `LoginRequest` | `TokenResponse` | `backend/app/routers/auth.py:31` |
| GET | `/auth/me` | any user | – | `UserOut` | `backend/app/routers/auth.py:43` |
| POST | `/rag/documents` | **admin** | `multipart/form-data` (file) | `DocumentOut` | `backend/app/routers/rag.py:32` |
| GET | `/rag/documents` | any user | – | `list[DocumentOut]` | `backend/app/routers/rag.py:82` |
| DELETE | `/rag/documents/{document_id}` | **admin** | – | `{ok: true}` | `backend/app/routers/rag.py:87` |
| POST | `/rag/ask` | any user | `AskRequest {question, history[]}` | `AskResponse {answer, sources[], question_id}` | `backend/app/routers/rag.py:103` |
| POST | `/rag/questions/{question_id}/feedback` | any user | `FeedbackRequest {feedback}` | `{ok: true}` | `backend/app/routers/rag.py:140` |
| GET | `/rag/questions` | **admin** | query: `feedback?` | `list[QuestionOut]` | `backend/app/routers/rag.py:158` |
| GET | `/rag/stats` | **admin** | – | `RagStats` | `backend/app/routers/rag.py:170` |
| POST | `/complaints` | any user | `ComplaintCreate {customer_name?, customer_contact?, raw_text}` | `ComplaintOut` | `backend/app/routers/complaints.py:22` |
| GET | `/complaints` | any user | query: `status?, category?, urgency?` | `list[ComplaintOut]` | `backend/app/routers/complaints.py:55` |
| GET | `/complaints/stats` | any user | – | `ComplaintStats` | `backend/app/routers/complaints.py:73` |
| GET | `/complaints/{complaint_id}` | any user | – | `ComplaintOut` | `backend/app/routers/complaints.py:101` |
| PATCH | `/complaints/{complaint_id}/reply` | any user | `ReplyRequest {final_reply}` | `ComplaintOut` | `backend/app/routers/complaints.py:109` |
| PATCH | `/complaints/{complaint_id}/status` | any user | `StatusUpdateRequest {status}` | `ComplaintOut` | `backend/app/routers/complaints.py:132` |

**Observations to verify in Phase 3 (not yet tested):**
- Every `/complaints/*` route only requires `get_current_user` — there is no
  ownership or role check, so any authenticated `agent` account can read, reply
  to, or change the status of every complaint, not just ones assigned to them.
  Whether that's intended (shared queue) or a gap is a judgment call, flagging
  for the report either way. `backend/app/routers/complaints.py` (whole file).
- No request-body size limit and no max-length validation on any `str` field in
  `schemas.py` (e.g. `ComplaintCreate.raw_text`, `AskRequest.question`) — needs
  the oversized-payload test in Phase 3.
- `POST /rag/documents` has no file-extension allowlist and no upload size cap;
  `file.file.read()` loads the whole upload into memory synchronously.
  `backend/app/routers/rag.py:42-43`.

---

## 3. Frontend routes & components

| Route | Guard | Page component | State / API calls |
|---|---|---|---|
| `/login` | public | `Login.jsx` | 5 `useState` (email, password, showPassword, error, busy); calls `api.login`, `api.me` |
| `/assistant` | authenticated | `Assistant.jsx` | 3 `useState` (messages, question, busy); calls `api.ask`, `api.sendFeedback` |
| `/complaints` | authenticated | `Complaints.jsx` | 6 `useState`; calls `api.listComplaints`, `api.submitComplaint` |
| `/complaints/:id` | authenticated | `ComplaintDetail.jsx` | 3 `useState`; calls `api.getComplaint`, `api.replyComplaint` |
| `/dashboard` | admin only | `Dashboard.jsx` | 2 `useState`; calls `api.ragStats`, `api.complaintStats` |
| `/documents` | admin only | `AdminDocuments.jsx` | 4 `useState`; calls `api.listDocuments`, `api.uploadDocument`, `api.deleteDocument` |
| `*` | – | redirects to `/assistant` | – |

Shared components: `Layout.jsx` (sidebar/nav shell, logout), `Icon.jsx` (Material
Symbols wrapper). Route guarding (`Protected`/`adminOnly` in `App.jsx:12-18`) is
**client-side only**; the actual authorization boundary is the backend's
`require_admin` dependency (§2). This matches up correctly for every
admin-gated frontend page **except** `GET /rag/documents`, which the backend
allows for any authenticated user even though the only frontend caller
(`AdminDocuments.jsx`) is admin-gated — low-severity information exposure
(document titles/status only, not content) if a non-admin agent calls the API
directly. To be confirmed with an actual request in Phase 3.

JWT is stored in `localStorage` (`frontend/src/api/client.js:4-10`,
`AuthContext.jsx:11`), not an httpOnly cookie — standard XSS-exfiltration
concern, to be weighed against the fact there is no `dangerouslySetInnerHTML`
or `innerHTML` anywhere in `frontend/src` (confirmed via search) so the app
has no obvious first-party XSS sink today. Third-party/dependency XSS is
out of scope for a grep-only pass — real coverage needs Phase 2/5 execution.

---

## 4. Background jobs, scripts, CLI entry points, migrations

**None exist.** Specifically:
- No `scripts/`, `Makefile`, `Dockerfile`, `docker-compose.yml`.
- No Alembic / migration tooling — schema is created via
  `Base.metadata.create_all()` on FastAPI startup (`backend/app/main.py:32`),
  matching the README's documented deviation from the original spec.
- No Celery/RQ/cron/background worker of any kind.
- The closest thing to a "job" is `vectorstore.rebuild_index(db)`, which runs
  synchronously in-request on startup and on every document upload/delete
  (`backend/app/main.py:50`, `backend/app/routers/rag.py:78,99`) — it rescans
  **all** `document_chunks` rows and refits a fresh `TfidfVectorizer` in the
  request thread, blocking that request until done. At current corpus size (1
  chunk) this is instant; not tested at scale.
- `vectorstore._state` (`backend/app/services/vectorstore.py:36`) is a plain
  module-level dict, not locked. A rebuild racing with a concurrent `/rag/ask`
  read is a possible source of inconsistent/torn reads under concurrency —
  flagged for the Phase 3 concurrency test, not yet observed.

---

## 5. External dependencies & where config/keys come from

| Dependency | Purpose | Config source | Notes |
|---|---|---|---|
| Groq API (`groq` SDK, model `openai/gpt-oss-120b`) | LLM for RAG answers + complaint triage | `GROQ_API_KEY`, `GROQ_MODEL` env vars → `backend/app/config.py:10-11` | **A live, non-empty key is currently set in `backend/.env`** (confirmed present without printing the value). `ai_enabled` property (`config.py:19-21`) gates real calls vs. mock; every AI call site catches all exceptions and falls back to a deterministic mock (`ai_client.py:143-145,197-199`) so a Groq outage should not 500 the API — not yet tested. |
| SQLite | primary datastore | `DATABASE_URL` env var → `backend/app/config.py:13`, default `sqlite:///./data/poste.db` | Single-file DB, already contains dev/demo rows (§7), not a clean fixture. |
| Local filesystem | uploaded document storage | `UPLOAD_DIR` env var → `backend/app/config.py:14`, default `./data/uploads` | No virus/type scanning, no size cap (§2). |
| TF-IDF retrieval (scikit-learn) | "vector store" for RAG | in-process, no config, no persistence — rebuilt from DB on every startup/change | Not an external service; listed because README/brief calls it a vector store. There is **no ChromaDB, no embeddings, no external vector DB** anywhere in this codebase. |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Geist + Material Symbols webfonts | hardcoded `<link>` tags, `frontend/index.html:7-10` | External CDN dependency with no self-hosted fallback — app will render with fallback fonts (not broken) but icons (Material Symbols) may not render at all if this CDN is unreachable, since `Icon.jsx` likely relies on the ligature font rather than SVGs — to be confirmed visually in Phase 5 with network blocked. |

**No** message queue, cache layer (Redis etc.), object storage, or embeddings
provider exists in this codebase.

---

## 6. Env vars: code vs. `.env.example`

Every field in `Settings` (`backend/app/config.py:4-21`) maps 1:1 to a line in
`backend/.env.example`:

| Settings field | .env.example key | Match? |
|---|---|---|
| `secret_key` | `SECRET_KEY` | ✅ |
| `access_token_expire_minutes` | `ACCESS_TOKEN_EXPIRE_MINUTES` | ✅ |
| `groq_api_key` | `GROQ_API_KEY` | ✅ |
| `groq_model` | `GROQ_MODEL` | ✅ |
| `database_url` | `DATABASE_URL` | ✅ |
| `upload_dir` | `UPLOAD_DIR` | ✅ |
| `admin_email` | `ADMIN_EMAIL` | ✅ |
| `admin_password` | `ADMIN_PASSWORD` | ✅ |

**No mismatch found.** `backend/.env` (the real, git-ignored file) has the same
8 keys, all non-empty, confirmed via `grep` without printing values.
`.env` is correctly excluded via `backend/.gitignore`'s parent `.gitignore`
(`.env` line) and is **not** tracked in git (`git ls-files | grep '\.env$'`
returned nothing) — no leaked secret in the working tree today. Full history
scan for secrets is Phase 2 work, not done yet.

CORS is hardcoded to `http://localhost:5173` / `http://127.0.0.1:5173`
(`backend/app/main.py:19`) — not env-configurable, fine for local dev, would
need changing for any real deployment (noted for the improvements list).

---

## 7. Data files

### RAG corpus
- **Exactly one source document**: `sample_procedure_ccp.txt` (18 lines, ~1KB,
  French), covering a single procedure — "Ouverture d'un compte CCP." It has
  been uploaded once and produced **1 row** in `document_chunks`
  (confirmed via direct SQLite query against `backend/data/poste.db`: `users=1,
  documents=1, document_chunks=1, questions=32, complaints=2, audit_log=53`).
- **This is a hard blocker for the Phase 4 RAG eval plan as specified.** The
  brief asks for 10 answerable questions, 5 answerable only by combining 2
  documents, and 5 unanswerable, drawn from "the real procedures corpus."
  There is only one ~200-word document about one procedure in the corpus —
  there are not 2 documents to combine, and it's doubtful the single document
  contains 10 independently-answerable facts. Phase 4 will need either (a) the
  user to supply more real procedure documents, or (b) an explicit scope
  reduction agreed with the user before Phase 4 starts. Flagging now rather
  than fabricating a corpus or silently shrinking the eval.

### Complaint "dataset"
- **There is no complaint training dataset, and no trained classifier.**
  Complaint triage (`classify_complaint` in
  `backend/app/services/ai_client.py:117-145`) is either:
  1. a **live Groq LLM call** with a strict JSON schema (category/urgency/
     summary/draft_reply), when `GROQ_API_KEY` is set (it is, currently), or
  2. a **hardcoded keyword-matching heuristic** (`_mock_classify`,
     `ai_client.py:83-114`) when no key is set.
  Neither path involves scikit-learn, a trained model, a train/test split, or
  any stored labeled dataset. The only place `sklearn` is used in this repo is
  `vectorstore.py` for RAG retrieval (TF-IDF + cosine similarity), which is
  unsupervised and has no "accuracy" to measure.
  **This directly contradicts the audit brief's Phase 4 assumption of a "TF-IDF
  complaint classifier" that can be "retrained" with accuracy/F1/confusion-matrix
  metrics.** That classifier does not exist in this codebase. Phase 4's
  classifier section will be marked BLOCKED with this exact explanation unless
  the user clarifies they mean evaluating the LLM-based classification
  qualitatively (which is testable, just not with sklearn metrics) or wants a
  net-new classifier built (which is out of scope for an audit — the rules say
  not to modify application code, and building a new model is not modification,
  it's new scope that needs explicit sign-off).
- The live DB currently has 2 real `complaints` rows (from prior manual demo
  use, not a curated test set).

---

## 8. Existing tests

**None.** `find . -iname "*test*"` across the whole repo (excluding
`node_modules`/`venv`/`.git`) returns only the empty `tests/` directory created
for this audit. Zero coverage today across backend and frontend — this
confirms the brief's assumption ("usually very little — say so").

---

## 9. Toolchain gaps found during inventory (affects Phase 1/2 planning)

- **No TypeScript in the frontend** (`frontend/package.json` — plain
  `.jsx`, no `typescript` dependency, no `tsconfig.json`). Phase 2's
  `tsc --noEmit` step is **not applicable** to this repo and will be marked
  N/A rather than BLOCKED (there is nothing broken — the tool doesn't apply).
- **No ESLint config** anywhere in `frontend/` (no `.eslintrc*`, no `eslint`
  in `package.json` deps). Phase 2 will need to install and configure ESLint
  from scratch before it can run — this is itself a finding (no lint gate
  exists today), not just a blocker to work around.
- **No `ruff`, `mypy`, `pytest`, `pytest-cov`, `pip-audit`** in
  `backend/requirements.txt` — none of these are installed in the existing
  `backend/venv`. Phase 1/2/3 will need to install them (as dev tooling, not
  by modifying `requirements.txt`, unless the user wants that persisted).

---

## Summary

- 15 backend endpoints, 6 frontend routes, all mapped above with file:line.
- No background jobs, no migrations, no Docker — confirmed absent, not assumed.
- Real Groq API key is configured — AI features are live, not mocked, in this
  environment. Phase 4 testing against it will consume real API quota.
- Env vars: perfect 1:1 match between code and `.env.example`, no leaked
  secrets in the tracked working tree.
- **Two scope problems with the audit brief itself, found during inventory,
  not assumed:**
  1. The RAG corpus has only 1 document — the planned 20-question eval set
     (especially the "combine 2 documents" questions) cannot be built as
     specified without more source documents.
  2. There is no TF-IDF-trained complaint classifier to retrain/score —
     complaint triage is an LLM call (or keyword-heuristic mock), not a
     trainable model. Phase 4's classifier metrics section is BLOCKED as
     specified.
- Zero existing test coverage, zero lint/type-check tooling installed.

**Nothing above has been executed or tested — this is a static map only.**
Phase 1 (build & boot) is the first phase involving actual execution.

---

## STOP — end of Phase 0

Waiting for confirmation to continue to Phase 1 (build & boot), and for a
decision on the two scope problems in §7 (thin RAG corpus, no classifier to
retrain) before Phase 4 is reached.
