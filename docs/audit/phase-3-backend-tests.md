# Phase 3 — Backend Functional Testing

Branch: `qa/full-audit`. **94 tests written and executed, 94 passed, 0 failed.**
Every number below comes from real `pytest`/`pytest-cov` runs; commands and
real output are included as evidence, not summarized from reading code.

## Test environment

Fully isolated from the dev instance used in Phases 0/1/2 — a fresh temp
SQLite DB and temp upload dir created per test session (`tests/conftest.py`),
`GROQ_API_KEY` forced empty so the suite exercises the deterministic mock AI
path (fast, free, repeatable). **This never touched the hand-built 9-document
RAG corpus or burned any Groq quota** — that corpus and the live key are
reserved for Phase 4. Two tests (`test_phase2_followups.py`) directly
monkeypatch `ai_client._client` with a mocked Groq response to test specific
edge cases without needing a real key — a legitimate white-box technique,
not a live-API test.

```
$ backend/venv/Scripts/python.exe -m pytest tests/ --cov=backend/app --cov-report=term-missing -q
94 passed, 177 warnings in 11.28s
```

The 177 warnings are all either known/expected (the `datetime.utcnow()` and
`on_event` deprecations already flagged in Phase 2, now also confirmed firing
at runtime) or from the tests' own deliberate use of `datetime.utcnow()` to
match the app's own convention when crafting test JWTs.

## Coverage

```
Name                                  Stmts   Miss  Cover   Missing
-------------------------------------------------------------------
backend\app\__init__.py                   0      0   100%
backend\app\auth.py                      37      0   100%
backend\app\config.py                    15      0   100%
backend\app\db.py                        14      0   100%
backend\app\main.py                      32      0   100%
backend\app\models.py                    69      0   100%
backend\app\routers\__init__.py           0      0   100%
backend\app\routers\auth.py              29      0   100%
backend\app\routers\complaints.py        75      0   100%
backend\app\routers\rag.py              104      0   100%
backend\app\schemas.py                   90      0   100%
backend\app\services\__init__.py          0      0   100%
backend\app\services\ai_client.py        79     17    78%   21-23, 121-145, 194-195, 197-199
backend\app\services\documents.py        27      1    96%   39
backend\app\services\vectorstore.py      30      0   100%
-------------------------------------------------------------------
TOTAL                                   601     18    97%
```

**97% overall, 100% on every router, every model, every schema, auth, db,
config, and the vectorstore.** The two files under 100%:

- **`ai_client.py` (78%)** — every uncovered line is the **real Groq API call
  path** (`_client = Groq(...)` init, the live `classify_complaint` and
  `answer_question` request bodies). This is intentional, not a gap: Phase 3
  tests the API surface with the deterministic mock; Phase 4 is where the
  live-key path gets exercised and evaluated for quality. Two of the
  previously-uncovered mock-path lines (billing category, greeting/thanks
  replies) were closed with targeted tests once identified.
- **`documents.py` (96%, 1 line: `documents.py:39`)** — a defensive
  `if not chunk_words: break` inside the chunking loop's `for` over
  `range(0, len(words), step)`. Given `step >= 1` and the loop bound, this
  branch is very likely unreachable in practice (the `range()` bounds already
  prevent `start` from producing an empty slice) — not worth contriving a
  test for a probably-dead defensive line.

## Endpoint-by-endpoint results

| Endpoint | Happy path | Validation (missing/wrong-type/empty) | Unicode/Arabic/emoji | Injection/traversal | Auth (unauth + wrong role) | Verdict |
|---|---|---|---|---|---|---|
| `GET /` | ✅ | – | – | – | – (public) | **PASS** |
| `POST /auth/login` | ✅ | ✅ (missing field, null, wrong type, empty body → 422; empty strings → 401) | – | ✅ (2 SQLi payloads → 401, not bypassed) | – (public) | **PASS** |
| `POST /auth/register` | ✅ | ✅ (missing fields → 422; duplicate email → 400; **empty password accepted — confirms no min-length policy**) | ✅ (Arabic+French name round-trips exactly) | – | ✅ (401 unauthenticated, 403 non-admin) | **PASS**, 1 confirmed weak-validation finding |
| `GET /auth/me` | ✅ | – | – | – | ✅ (no token, malformed, wrong scheme, **expired token**, **token for nonexistent user**, **wrong-secret forgery**, **alg:none forgery** — all correctly 401) | **PASS** |
| `POST /rag/documents` | ✅ (txt/pdf/docx all extract correctly) | ✅ (no file field → 422; empty file handled without crash) | – | ✅ (path-traversal filename confirmed **not** escaping `UPLOAD_DIR`; corrupted PDF correctly caught, marked `failed`, doesn't 500) | ✅ (401 unauthenticated, 403 non-admin) | **PASS** |
| `GET /rag/documents` | ✅ | – | – | – | ✅ (401 unauthenticated; **confirmed any authenticated non-admin can list documents**, per Phase 0 finding) | **PASS**, confirms prior finding |
| `DELETE /rag/documents/{id}` | ✅ | ✅ (nonexistent id → 404) | – | – | ✅ (401, 403) | **PASS** |
| `POST /rag/ask` | ✅ | ✅ (missing question → 422; null → 422; **empty string accepted — no min-length**) | ✅ (Arabic question, emoji + Tunisian-dialect-French mix, all 200 with real answers) | ✅ (SQLi-shaped question doesn't affect DB, confirmed via follow-up query; prompt-injection-shaped question doesn't crash the mock path) | ✅ (401 unauthenticated) | **PASS**, with 1 **CONFIRMED BUG** (see below) |
| `POST /rag/questions/{id}/feedback` | ✅ | ✅ (invalid value → 400; nonexistent question → 404) | – | – | (inherits ask's auth) | **PASS** |
| `GET /rag/questions` | ✅ (incl. `feedback` filter) | – | – | – | ✅ (403 non-admin) | **PASS** |
| `GET /rag/stats` | ✅ | – | – | – | ✅ (403 non-admin) | **PASS** |
| `POST /complaints` | ✅ (realistic Tunisian complaint text) | ✅ (missing `raw_text` → 422; **empty string accepted — no min-length**) | ✅ (Arabic+dialect+French mixed round-trips exactly; emoji accepted) | ✅ (10,240-char complaint accepted without truncation/error; SQLi-shaped text stored inertly, table unaffected; gibberish still gets a non-null category/urgency from the mock classifier) | ✅ (401 unauthenticated) | **PASS** |
| `GET /complaints` | ✅ (status/category/urgency filters all correct) | ✅ (invalid filter value → empty list, not an error) | – | – | ✅ (401 unauthenticated; **confirmed any authenticated agent sees every complaint, not just their own**, per Phase 0 finding) | **PASS**, confirms prior finding |
| `GET /complaints/stats` | ✅ (incl. `avg_resolution_hours` populated after a reply) | – | – | – | ✅ (401 unauthenticated) | **PASS** |
| `GET /complaints/{id}` | ✅ | ✅ (nonexistent → 404) | – | – | (inherits list's auth) | **PASS** |
| `PATCH /complaints/{id}/reply` | ✅ | ✅ (missing field → 422; nonexistent → 404) | – | – | (inherits list's auth) | **PASS** |
| `PATCH /complaints/{id}/status` | ✅ | ✅ (invalid status → 400; nonexistent → 404) | – | – | (inherits list's auth) | **PASS** |

**15/15 endpoints functionally PASS.** No endpoint crashed, leaked data across
auth boundaries incorrectly relative to its own design, or mishandled the
unicode/injection/oversized-payload test inputs used above.

## Confirmed findings from this phase (upgraded from Phase 2's "plausible")

### 1. CONFIRMED BUG (was: plausible, mypy-flagged) — `POST /rag/ask` can raise an unhandled `ValidationError`, contradicting the app's own "never 500s on AI hiccup" design goal

**Severity: MEDIUM.** Reproduced directly with a mocked Groq client
(`tests/test_phase2_followups.py::test_answer_question_none_content_from_groq_bypasses_mock_fallback`
and `::test_ask_endpoint_500s_when_groq_returns_none_content`):

```
E       pydantic_core._pydantic_core.ValidationError: 1 validation error for AskResponse
E       answer
E         Input should be a valid string [type=string_type, input_value=None, input_type=NoneType]
backend\app\routers\rag.py:137: ValidationError
```

When Groq returns a response with `message.content = None` under any
`finish_reason` other than `"content_filter"` (e.g. `"stop"` with an empty
completion — a real, if uncommon, thing LLM APIs do), `answer_question()`
(`backend/app/services/ai_client.py:196`) returns `None` directly from inside
its `try` block. Returning `None` doesn't raise, so it **bypasses the
`except Exception` fallback entirely** — the function's own safety net never
engages. `rag.py:137` then constructs `AskResponse(answer=None, ...)`, and
since `AskResponse.answer` is a non-optional `str`
(`backend/app/schemas.py:67`), Pydantic raises a `ValidationError`. In
`TestClient`, this re-raises directly (by design, for debuggability); on a
real `uvicorn` server with no such re-raise, this is the standard mechanism
by which an unhandled exception becomes an **HTTP 500** to the caller. This
directly contradicts `ai_client.py`'s own module docstring: *"this endpoint
should never 500 because of an AI provider hiccup."*

**Fix**: in `answer_question()`, treat `choice.message.content is None` the
same as the `content_filter` case — fall back to `_mock_answer(...)` instead
of returning it directly.

### 2. DOWNGRADED to false positive (was: plausible, mypy-flagged) — the `file.filename: str | None` risk in `POST /rag/documents`

**Severity: none — confirmed not reachable.** mypy flagged
`os.path.basename(file.filename)` at `rag.py:39` because FastAPI types
`UploadFile.filename` as `str | None`. Tested two ways:

- A client-encoded empty filename (`files={"file": ("", ...)}`) — httpx
  itself omits the filename attribute when given an empty string, so
  Starlette parses the part as a plain string form field, and FastAPI/Pydantic
  correctly rejects it with `422 Expected UploadFile, received: <class
  'str'>` before the code in question ever runs.
- A **hand-crafted raw multipart body** with a `file` part that has **no
  `filename` attribute in its `Content-Disposition` header at all** (the
  actual scenario the type annotation warns about, bypassing httpx's
  client-side encoding choices entirely) —
  `tests/test_phase2_followups.py::test_upload_with_truly_missing_filename_attribute`
  — got the **exact same result**: `422 Expected UploadFile, received: <class
  'str'>`.

**Conclusion**: Starlette's multipart parser only constructs an `UploadFile`
object when a `filename` is present on the part; without one, it's parsed as
a plain string field, and FastAPI's own parameter validation rejects it
before `rag.py:39` executes. The `str | None` in the type stub is technically
accurate for the `UploadFile.filename` *attribute* in the general case, but
for this specific app's usage (a required, non-Optional `file: UploadFile`
parameter), the `None` branch is unreachable in practice. mypy was right to
flag the type gap; the runtime behavior turns out to be safe anyway.

## Confirmed findings carried over from Phase 0 (now verified, not just read)

- **`GET /rag/documents` is not admin-gated** — confirmed live: a
  non-admin `agent` token successfully lists documents
  (`tests/test_rag.py::test_list_documents_any_authenticated_user`).
- **No ownership scoping on complaints** — confirmed live: a complaint
  created by one user (admin) is visible in another user's (agent's) `GET
  /complaints` listing
  (`tests/test_complaints.py::test_list_complaints_any_authenticated_user_sees_all`).
- **No `max_length`/`min_length` on any free-text field** — confirmed live:
  empty `raw_text`, empty `question`, empty `password` are all accepted with
  `200`, and a 10,240-character complaint is accepted without truncation or
  error.
- **Path traversal in upload filenames is blocked** — confirmed live:
  `os.path.basename()` correctly strips `../../../` sequences; no file
  escaped `UPLOAD_DIR` (verified by checking the filesystem directly, not
  just the HTTP response).
- **The swallowed-exception branch at `rag.py:72`** — confirmed live: an
  intentionally corrupted `.pdf` upload does trigger it, the document is
  correctly marked `"failed"` and the request itself doesn't 500 — but as
  Phase 2 noted, there's genuinely no log line anywhere recording *why* it
  failed, confirmed by watching the captured test log output during that
  test (only the expected startup log lines appear, nothing about the
  extraction failure).

## Security-specific results

- **SQL injection**: every text field tested (`email`, `raw_text`,
  `question`, `customer_name`) with classic SQLi payloads
  (`' OR '1'='1`, `'; DROP TABLE ...; --`) was treated as inert literal text.
  SQLAlchemy's parameterized `.filter(Model.field == value)` pattern, used
  consistently across every query in the codebase (confirmed in Phase 0's
  reading pass, now empirically confirmed), holds up under direct testing.
  **No SQL injection found.**
- **Path traversal**: blocked, confirmed above.
- **JWT forgery**: expired tokens, tokens for nonexistent users, tokens
  signed with a wrong/guessed secret, and a classic `alg: none` forgery
  attempt (hand-built, not relying on PyJWT's client-side willingness to
  produce one) were **all correctly rejected with 401**.
- **Role escalation**: every admin-only endpoint (`POST /auth/register`,
  `POST`/`DELETE /rag/documents`, `GET /rag/questions`, `GET /rag/stats`)
  correctly returned `403` for an authenticated non-admin agent, in addition
  to `401` for no auth at all.

## Concurrency (20 parallel requests)

```
tests/test_concurrency_and_edge_cases.py::test_20_concurrent_ask_requests PASSED
tests/test_concurrency_and_edge_cases.py::test_concurrent_document_upload_and_ask PASSED
```

20 parallel `POST /rag/ask` requests via a `ThreadPoolExecutor` all returned
`200` with well-formed bodies; a second test raced a document upload
(which replaces `vectorstore._state` — see Phase 0's flagged torn-read
concern) against 9 concurrent `/rag/ask` reads of that same state, and all 10
requests completed cleanly with no crash.

**Caveat, stated plainly**: `TestClient` runs the ASGI app in-process with a
thread pool under the hood — this is a real concurrency test of Python-level
thread-safety (which is what the `vectorstore._state` shared-dict concern is
actually about), but it is **not** a true separate-process load test and
doesn't prove behavior under real multi-worker/multi-process production
deployment (e.g. multiple `uvicorn` workers each with their own process
memory wouldn't even share `_state`, which is a different, unexplored
concern for a future horizontal-scaling scenario). No torn reads or crashes
were observed at the concurrency level actually tested.

---

## Summary

| Check | Result |
|---|---|
| Endpoints tested | 15/15, all with real requests and real responses |
| Tests written & executed | 94 |
| Tests passed | **94 (100%)** |
| Code coverage | **97%** overall; 100% on every router/model/schema/auth/db/vectorstore; the only gaps are the intentionally-deferred live-Groq paths (Phase 4) and one likely-dead defensive line |
| SQL injection | None found (parameterized queries hold up under direct testing) |
| Path traversal | Blocked, confirmed |
| JWT forgery (expired/wrong-secret/alg:none/no-sub/nonexistent-user) | All correctly rejected |
| Role/auth boundaries | All correctly enforced (401/403 as appropriate) |
| Confirmed NEW bug this phase | `POST /rag/ask` can raise an unhandled `ValidationError` (≈HTTP 500) on a specific Groq response shape — reproduced, not just theorized |
| Resolved Phase 2 open question | `file.filename=None` risk confirmed **not reachable** — downgraded to false positive |
| Concurrency (20 parallel) | No crashes, no torn reads observed (in-process thread-level test, caveat noted) |

## STOP — end of Phase 3

Waiting for confirmation to continue to Phase 4 (AI-specific testing — RAG
eval using the 9-document corpus and live Groq key, complaint-triage
qualitative testing since no trained classifier exists per Phase 0 §7,
prompt-injection testing against the real model, and Groq-failure-mode
testing including reproducing today's confirmed bug against the *real* API
if it's practical to trigger).
