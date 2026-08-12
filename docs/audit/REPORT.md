# poste-ai-suite — Full QA & Security Audit Report

Branch: `qa/full-audit`. Six phases, all executed for real (commands run,
output captured, screenshots taken, real API calls made against a live Groq
key) — no phase result in this document is inferred from reading code alone
unless explicitly labeled as such. Source phase reports:
[`phase-0-inventory.md`](phase-0-inventory.md) ·
[`corpus-expansion.md`](corpus-expansion.md) ·
[`phase-1-setup.md`](phase-1-setup.md) ·
[`phase-2-static-analysis.md`](phase-2-static-analysis.md) ·
[`phase-3-backend-tests.md`](phase-3-backend-tests.md) ·
[`phase-4-ai-testing.md`](phase-4-ai-testing.md) ·
[`phase-5-frontend.md`](phase-5-frontend.md).

---

## 1. Executive summary

**Demo-ready: yes, comfortably.** **Internship/PFE-defense-ready: yes** — the
core engineering (auth, RAG retrieval+generation, complaint triage,
prompt-injection resistance) held up under genuinely adversarial testing, not
just happy-path clicking. **Production-ready: no, not close**, and that gap
is not a matter of polish — it's a specific, enumerable list of things a real
deployment needs that were never built, because the project was never scoped
to need them yet.

Why the top two verdicts are earned, bluntly: this audit threw real SQL
injection, JWT forgery (including a hand-built `alg: none` attack), path
traversal, direct and indirect prompt injection (a malicious instruction
embedded inside an uploaded document), and 20 hand-adversarial RAG questions
(including 5 designed to be unanswerable) at the running system — and it
held. Zero injections succeeded. Zero hallucinations on the unanswerable
question set, even when noisy retrieval fed irrelevant context into the
prompt. That is a genuinely strong result for a project with zero
pre-existing test coverage.

Why "production-ready" is a clear no, equally bluntly: the app is unusable
on a phone (a fixed 260px sidebar eats 69% of a 375px screen, confirmed via
the exact CSS values, not a guess); a backend network hiccup silently logs
every user out by design; there is a confirmed, reproduced code path where a
specific Groq response shape causes an unhandled `ValidationError` that
directly contradicts the codebase's own documented "never 500s" promise; the
PDF parser feeding an upload endpoint with no size or type limit is 14 minor
versions behind with 37 known advisories; and there was zero test coverage,
zero CI, and zero lint/type-check tooling before this audit added them on
this branch. None of this is exotic — it's the standard "demo vs.
production" checklist, and this project is still on the demo side of nearly
all of it.

**One important scoping note carried from Phase 0, not a defect in the
app**: this audit's original brief assumed a trained TF-IDF complaint
classifier existed, evaluable with accuracy/F1/confusion-matrix metrics. It
doesn't — complaint triage is Groq-LLM-based (with a keyword-heuristic
mock fallback), same as the RAG assistant. That section of the brief was
retargeted to qualitative LLM-classification testing instead, documented in
Phase 4, and is not counted as a project defect.

---

## 2. Feature status table

| Feature | Status | Evidence |
|---|---|---|
| `GET /` | PASS | Phase 3 |
| `POST /auth/login` | PASS | Phase 3 (incl. SQLi resistance) |
| `POST /auth/register` | PASS | Phase 3 (admin-gated, confirmed) |
| `GET /auth/me` | PASS | Phase 3 (7 JWT-forgery vectors all correctly rejected) |
| `POST /rag/documents` (upload) | PASS functionally, FAIL hardening | Phase 3 (traversal blocked, pdf/docx/corrupted all handled); Phase 0/2 (no size/type cap, outdated pypdf) |
| `GET /rag/documents` | PASS, minor gap | Phase 3 (works; confirmed not admin-gated despite admin-only frontend page) |
| `DELETE /rag/documents/{id}` | PASS | Phase 3 |
| `POST /rag/ask` | PASS functionally, 1 confirmed bug | Phase 3/4 (20/20 eval correct); Phase 2/3 (confirmed unhandled `ValidationError` on a specific Groq response shape) |
| `POST /rag/questions/{id}/feedback` | PASS | Phase 3 |
| `GET /rag/questions`, `GET /rag/stats` | PASS | Phase 3 (admin-gated, confirmed) |
| `POST /complaints` | PASS | Phase 3/4 (incl. Tunisian dialect, 10k chars, injection) |
| `GET /complaints`, `/complaints/stats` | PASS, minor gap | Phase 3 (works; confirmed no ownership scoping — possibly by design) |
| `GET/PATCH /complaints/{id}` | PASS | Phase 3 |
| RAG retrieval quality | PASS with a caveat | Phase 4: 100% top-4 hit-rate, 80% top-1 (near-duplicate-doc confusion found but didn't propagate to wrong answers) |
| RAG generation quality | PASS | Phase 4: 20/20 correct, 0% hallucination, cross-lingual (Arabic question on French corpus) |
| Prompt-injection resistance (RAG) | PASS | Phase 4: direct + indirect (malicious document) both resisted |
| Prompt-injection resistance (complaints) | PASS | Phase 4 |
| Groq failure fallback | PASS with 1 confirmed bug, 1 perf gap | Phase 4: invalid key/network-down correctly caught; 16.2s hang (no timeout set); Phase 2/3: confirmed unhandled exception on `content=None` |
| Complaint classification quality | PASS with product gaps | Phase 4: correct on realistic/dialect/ambiguous/gibberish; taxonomy missing a category, no confidence signal |
| Frontend — all 6 pages render/fetch | PASS | Phase 5, zero console errors |
| Frontend — XSS resistance | PASS | Phase 5, confirmed live with an injected payload |
| Frontend — double-submit | PASS | Phase 5 |
| Frontend — Markdown rendering | **FAIL** | Phase 5, confirmed live |
| Frontend — label translation consistency | **FAIL** | Phase 5, confirmed live |
| Frontend — backend-down resilience | **FAIL** | Phase 5, confirmed live (silent logout) + confirmed via source (unhandled load failures) |
| Frontend — accessibility (labels, keyboard) | PASS | Phase 5 |
| Frontend — accessibility (icons) | **FAIL** | Phase 5, confirmed via accessibility tree |
| Frontend — accessibility (contrast) | NOT TESTED | No tooling available |
| Frontend — mobile viewport | **FAIL** | Phase 5, confirmed via source (browser resize tool didn't work in this environment) |
| Secrets hygiene (full git history) | PASS | Phase 2, 25 commits checked exhaustively |
| Test coverage | N/A before audit → 97% added on this branch | Phase 3 |
| Static analysis tooling | N/A before audit → set up on this branch | Phase 2 |
| Complaint classifier retrain/F1/confusion-matrix | **BLOCKED — not applicable** | Phase 0/4: no trained model exists in this codebase |
| Docker/deployment | NOT ATTEMPTED — deliberately out of MVP scope | Phase 0/1, per README's own documented deviation |

---

## 3. Findings, by severity

Each finding: file:line, repro/evidence, phase it was found in.

### HIGH

**H1. Confirmed: `POST /rag/ask` raises an unhandled `pydantic_core.ValidationError` (≈ HTTP 500) on a specific real Groq response shape, contradicting the codebase's own documented guarantee.**
`backend/app/services/ai_client.py:196` returns `choice.message.content`
directly inside the `try` block without checking for `None`; if Groq returns
`content=None` under any `finish_reason` other than `"content_filter"`
(confirmed real behavior, not hypothetical — e.g. `"stop"` with an empty
completion), this bypasses the function's own `except Exception` fallback
entirely (returning `None` doesn't raise). `backend/app/routers/rag.py:137`
then builds `AskResponse(answer=None, ...)` against a non-optional `str`
field (`backend/app/schemas.py:67`), and Pydantic raises. Reproduced directly
with a mocked Groq client in `tests/test_phase2_followups.py`. The
`ai_client.py` module docstring explicitly states *"this endpoint should
never 500 because of an AI provider hiccup"* — this is a confirmed violation
of that stated invariant. (Phase 2 → confirmed in Phase 3.)

**H2. Mobile layout is broken: fixed 260px sidebar with zero responsive override leaves ~115px for content at a 375px viewport width.**
`frontend/src/components/Layout.jsx:38` (`position: fixed`,
`w-sidebar-width` = 260px, `tailwind.config.js:65`) and `:99`
(`margin-left: 260px` on the main content area) have no `sm:`/`md:`/`lg:`
breakpoint override anywhere (`grep` confirms zero matches in the file). On
any phone-width screen this leaves roughly 115px for all page content —
chat bubbles, tables, forms, charts. This is a direct consequence of the
exact CSS values in the file, not a rendering guess. A live 375px screenshot
could not be captured in this session (the browser-automation tool's window
resize did not take effect — tested twice including on a fresh tab — a
tooling limitation, not something about the app itself), but the underlying
CSS fact stands regardless. (Phase 5.)

### MEDIUM

**M1. No explicit timeout on Groq API calls — a real network outage takes 16.2 seconds to fail over to the mock response.**
Neither call site in `ai_client.py` (`:122-137` for complaints,
`:187-191` for RAG answers) passes `timeout=` to
`_client.chat.completions.create(...)`. Reproduced with a real (not mocked)
unreachable-network scenario: `groq.APITimeoutError` after 16.2 seconds. The
eventual fallback does work (the "never breaks" claim technically holds),
but every request during a real outage makes the user wait 16+ seconds
first. (Phase 4.)

**M2. `AuthContext` treats any network failure identically to an invalid/expired token, silently logging the user out and discarding a still-valid JWT.**
`frontend/src/AuthContext.jsx:16-20` — `api.me().then(setUser).catch(() =>
setToken(null))` clears the token on *any* rejection, including a pure
connection failure when the backend is simply unreachable. Confirmed live:
stopping the backend and reloading any protected page redirects to
`/login`, even though the stored token was never actually invalid. A user
mid-task during a backend blip loses their session for no reason related to
their actual authentication state. (Phase 5.)

**M3. `Complaints.jsx` and `ComplaintDetail.jsx` have zero error handling in their data-loading and submit paths — a failed request (that doesn't trip the AuthContext logout path first) can leave the page stuck on "Chargement..." forever with no error message.**
`frontend/src/pages/Complaints.jsx:29-34` (`load()`), `:41-52`
(`handleSubmit` — has `try`/`finally` but no `catch`);
`frontend/src/pages/ComplaintDetail.jsx:12-16` (`load()`), same pattern.
Confirmed via source reading and the general backend-down test in Phase 5;
the specific "backend flakes mid-session rather than being down at page
load" trigger condition was not independently reproduced live, since
`AuthContext`'s redirect intercepts the more common down-at-reload case
first. The code gap is real regardless of which exact failure ordering
triggers it. (Phase 5.)

**M4. `rag.py:72` swallows the real exception on document-extraction failure with zero logging.**
```python
except Exception:
    document.status = "failed"
```
Confirmed both by `ruff`'s `BLE001` (which does *not* flag the two similar
`except Exception:` blocks in `ai_client.py` because those correctly call
`logger.exception(...)` first) and by a live test
(`tests/test_coverage_gaps.py::test_upload_corrupted_pdf_triggers_exception_branch`)
showing the document is marked `"failed"` with no diagnostic trace anywhere.
(Phase 2, confirmed Phase 3.)

**M5. `pypdf` is 14 minor versions behind (5.1.0, latest 6.15.x) with 37 unique known advisories, feeding an upload endpoint that has no file-size cap and no extension allowlist.**
`backend/requirements.txt:10`, `backend/app/routers/rag.py:32-79`
(`file.file.read()` with no size limit, no allowlist beyond extension-based
branching in `documents.py`). Upload is admin-gated, which tempers this to
an insider-threat/defense-in-depth concern rather than an anonymous attack
surface, but it's still the single largest concrete vulnerability count
found in this audit and directly feeds the most-outdated, most-CVE'd
dependency. (Phase 0, Phase 2.)

**M6. `python-multipart`, `pyjwt`, `starlette` are outdated with real advisories (6, 7, 7 unique respectively), some plausibly reachable pre-authentication.**
`backend/requirements.txt`. Most `pyjwt`/`starlette` advisories don't apply
to how this app actually uses those libraries (assessed individually in
Phase 2 — no `PyJWKClient` usage, no `FileResponse`, no `StaticFiles`), but
`python-multipart`'s DoS-class advisories (large preamble/epilogue parsing,
uncapped part-header count, negative `Content-Length`) are in the multipart
body-parsing path that any client hits when calling `POST /rag/documents`,
regardless of whether auth succeeds first. (Phase 2.)

**M7. Complaint category taxonomy has no category for mandat/money-order issues, despite that being a real, distinct La Poste Tunisienne service line.**
`backend/app/services/ai_client.py:25` — `COMPLAINT_CATEGORIES =
["delivery_delay", "lost_package", "billing", "damaged_item", "other"]`.
A realistic Tunisian-dialect complaint about an undelivered *mandat* was
correctly understood by the model but force-fit into `lost_package` for
lack of a better option. (Phase 4.)

**M8. No confidence scoring or low-confidence-refusal mechanism exists anywhere in complaint classification.**
`COMPLAINT_SCHEMA` (`ai_client.py:37-47`) has no confidence field; confirmed
live that gibberish and empty-string input both still produce a definite
`category`/`urgency` pair with zero ambiguity signal exposed to the caller,
unlike the RAG side's `MIN_RELEVANCE` floor. There is no way to route
low-confidence classifications to mandatory human review. (Phase 4.)

**M9. Every icon in the app announces its raw internal name to screen readers — systemic, app-wide accessibility bug.**
`frontend/src/components/Icon.jsx:5-11` renders the Material Symbols
ligature name (e.g. `"smart_toy"`, `"logout"`, `"person"`) as literal text
content with no `aria-hidden="true"`. Confirmed via the live accessibility
tree: the Assistant nav link's accessible name includes the raw string
`"smart_toy"` alongside its visible label. Affects every icon usage
app-wide — nav, buttons, form fields, logout. (Phase 5.)

### LOW

- **L1.** `GET /rag/documents` is not admin-gated despite its only frontend
  caller being an admin-only page — confirmed live, low-severity information
  exposure (document titles/status only). `rag.py:82`. (Phase 0, Phase 3.)
- **L2.** No ownership scoping on complaints — any authenticated agent sees
  every complaint, not just their own. Possibly intentional (shared queue);
  flagged as a judgment call either way. `complaints.py`. (Phase 0, Phase 3.)
- **L3.** No `max_length`/`min_length` validation on any free-text schema
  field — confirmed live (empty strings and a 10,240-char complaint both
  accepted with `200`). `schemas.py`. (Phase 0, Phase 3.)
- **L4.** AI-generated Markdown formatting is rendered as raw text in the
  chat UI (literal `**bold**` shown to users) — no Markdown parser wired up.
  `Assistant.jsx`. (Phase 5.)
- **L5.** Category/urgency/status label translation is inconsistent: the
  complaints list page translates urgency/status but not category; the
  detail page translates none of the three, despite the same label maps
  working correctly on the list page. `Complaints.jsx` vs.
  `ComplaintDetail.jsx`. (Phase 5.)
- **L6.** Misleading "Internal Server Error" message shown on the login page
  when the backend is simply unreachable (a connection failure, not a
  server-side error). `frontend/src/api/client.js`. (Phase 5.)
- **L7.** `npm audit`: 5 vulnerabilities (`esbuild` dev-server-only exposure,
  `nanoid` DoS, `react-router` open redirect ×2 — confirmed **not**
  reachable given this app's actual `<Link>`/`navigate()` usage, all
  hardcoded or server-derived, never raw user input). Free, non-breaking
  fixes available via `npm audit fix`. (Phase 1, Phase 2.)
- **L8.** TF-IDF retrieval ranks the wrong document first for 2/10
  answerable questions, due to two near-duplicate "mandat" documents —
  didn't propagate to wrong final answers (both docs still made the top-4),
  but a real, reproducible retrieval-quality limit at this corpus scale.
  (Phase 4.)
- **L9.** Complaint classification is single-label only — a genuinely
  multi-issue complaint (delay + damage) is force-fit into one category,
  silently discarding the other signal from the structured `category` field
  (though the prose summary does mention both). `COMPLAINT_SCHEMA`. (Phase 4.)
- **L10.** Language-consistency bug observed on content-free complaint
  input (gibberish/empty string): the live model mixed English and French
  within a single response instead of picking one consistently. Not
  code-controllable directly (a live-model behavior), but real and observed.
  (Phase 4.)

### NIT

- `datetime.utcnow()` used (deprecated since Python 3.12) — `auth.py:28`,
  `complaints.py:122`. (Phase 2, confirmed firing at runtime via pytest
  warnings in Phase 3.)
- Root logger used instead of a module logger — `main.py:45,55`. (Phase 2.)
- Unsorted imports (auto-fixable) — `auth.py:1`, `schemas.py:1`. (Phase 2.)
- Dead import (`datetime.datetime` unused) — `rag.py:4`. (Phase 2.)
- FastAPI `@app.on_event("startup")` is deprecated in favor of lifespan
  handlers — `main.py:30`. (Phase 3, pytest warnings.)
- No i18n infrastructure — 100% hardcoded French UI strings, by design for
  an MVP scoped to French-speaking staff. (Phase 0, Phase 2.)

---

## 4. Improvements

### 4.1 Architecture & code structure
**Problem**: `vectorstore._state` is a bare, unlocked module-level dict
(theoretical race risk under concurrent rebuild+query, not observed to
actually corrupt data in Phase 3's concurrency test); the deprecated
`@app.on_event("startup")` pattern is still in use; category/status label
maps are duplicated per-page instead of centralized (root cause of finding
L5).
**Fix**: migrate to FastAPI's `lifespan` context manager; wrap
`vectorstore`'s module state in a small class with an explicit lock or move
rebuild+query behind a single-writer pattern; extract `STATUS_LABEL`/
`URGENCY_LABEL`/a new `CATEGORY_LABEL` map into one shared
`frontend/src/constants.js` imported by every page that displays them.
**Effort**: S (lifespan + label centralization) / M (proper vectorstore
locking). **Impact**: Medium — removes deprecation warnings, kills L5 in one
shared fix, reduces a latent (if unobserved) race.

### 4.2 RAG quality
**Problem**: TF-IDF retrieval measurably confuses near-duplicate documents
at this corpus scale (L8); no reranking step; no confidence/similarity
score surfaced to the agent in the UI; AI Markdown not rendered (L4).
**Fix**: for corpus growth beyond a handful of documents, add a lightweight
reranking pass (even a cheap cross-encoder) over the TF-IDF top-k before
generation; surface the retrieval similarity score next to each cited
source in the UI so agents can judge answer confidence themselves; wire up
`react-markdown` for the chat bubble content — this alone is a small,
high-visibility fix given every eval transcript in Phase 4 contained
Markdown formatting.
**Effort**: S (Markdown renderer) / M (reranking + confidence UI).
**Impact**: High — directly improves both answer trustworthiness and
day-one UX; the Markdown fix in particular is cheap and highly visible.

### 4.3 Classifier upgrade path — and whether it's justified
**Problem**: no trained classifier exists (confirmed, Phase 0/4); the
LLM-based approach has a taxonomy gap (M7) and no confidence signal (M8).
**Fix, now**: expand `COMPLAINT_CATEGORIES` to include a mandat/money-order
category; add a `confidence` field to `COMPLAINT_SCHEMA` and route
low-confidence results to mandatory human review instead of silent
auto-triage; consider allowing multiple categories per complaint (L9) if
product wants that granularity. **Fix, later, explicitly not now**: training
a dedicated classifier is *not* justified today — there is no labeled
dataset of real complaint volume to train on (the DB currently has a
handful of test/demo complaints, not production volume). Revisit only once
real usage has produced hundreds+ of labeled complaints; until then, the
LLM-based approach is the correct engineering choice, not a stopgap.
**Effort**: S (taxonomy + confidence field) / L (a real classifier, and only
once data exists). **Impact**: Medium now (cheap, real UX/trust win);
potentially high later, but premature today.

### 4.4 Security & secrets handling
**Problem**: `pypdf` 14 versions behind (M5) feeding an unbounded upload
endpoint; `python-multipart`/`pyjwt`/`starlette` also outdated (M6); no
Groq call timeout (M1); CORS hardcoded to `localhost` only
(`backend/app/main.py:19`, fine for dev, blocks any real deployment).
**Fix**: bump all four backend dependencies to latest compatible versions
and re-run this audit's own 94-test pytest suite to confirm nothing breaks;
add a max upload size (e.g. 10MB) and extension allowlist to
`POST /rag/documents`; add explicit `timeout=` to both Groq call sites; make
`CORS` origins env-configurable via `pydantic-settings` (the same pattern
already used for every other setting in `config.py`).
**Effort**: S-M (dependency bumps + timeout are small; upload hardening and
CORS config are each small). **Impact**: High — closes the largest
concrete vulnerability count and the confirmed 16.2s-hang bug together.

### 4.5 Error handling and user-facing failure messages
**Problem**: `AuthContext` conflates network failure with an invalid token
(M2); `Complaints.jsx`/`ComplaintDetail.jsx` have no error handling at all
(M3); the login page's network-failure message is misleading (L6); `rag.py`
silently swallows the extraction-failure exception with no log (M4).
**Fix**: in `frontend/src/api/client.js`, distinguish a genuine network
failure (fetch throws before getting a response) from an actual HTTP 401
before deciding whether to clear the token; add `try`/`catch` + a visible
error/retry UI state to every page's `load()` and submit handlers,
consistently; replace the generic "Internal Server Error" text with a
network-failure-specific message when the fetch itself failed rather than
returned a real HTTP error; add `logger.exception(...)` before the
`document.status = "failed"` line in `rag.py:72`.
**Effort**: M (touches every page, but each individual change is small).
**Impact**: High — this is the specific gap between "demo that only works
when everything's up" and an app that degrades gracefully, which matters
enormously the moment this leaves a fully-controlled demo environment.

### 4.6 Test suite gaps and what CI should run
**Problem**: zero tests, zero lint/type-check tooling, zero CI existed
before this audit. This branch adds 94 backend tests (97% coverage) and a
working ESLint config, but neither is wired into CI, and there is still no
frontend test suite (no Vitest/React Testing Library).
**Fix**: merge this audit branch's `tests/` and tooling setup into `main`;
add a GitHub Actions workflow that runs `ruff`, `mypy`, and `pytest
--cov` on every backend change and `eslint` + `vite build` on every frontend
change, failing the PR on any regression; add a minimal frontend test suite
covering at minimum the label-consistency bug (L5) as a regression test, so
it can't silently reappear.
**Effort**: S (CI workflow file, since the tooling already exists on this
branch) / M (frontend test suite from scratch). **Impact**: High — the
single change most likely to prevent every other finding in this report
from recurring or from new ones like it slipping in unnoticed.

### 4.7 Docker / deployment reproducibility
**Problem**: no `Dockerfile`/`docker-compose.yml` anywhere; SQLite
single-file DB with no migrations (schema created via `create_all()` on
startup); CORS hardcoded to `localhost`. All of this is explicitly
documented in the README as a deliberate MVP deviation for fast local setup
— not an oversight — but it's also precisely what stands between this
project and any real deployment.
**Fix**: add a `Dockerfile` per service plus a `docker-compose.yml` for
local parity; introduce Alembic migrations before the schema needs its
first real post-launch change (retrofitting migrations onto an
already-changed production schema is much more painful than starting with
them); make CORS origins env-driven (ties into 4.4); only then evaluate the
README's own-documented Postgres migration path.
**Effort**: M. **Impact**: Medium — not urgent for continued demo/defense
use, but is the literal, specific blocker between "impressive working
prototype" and "something IT could actually stand up."

### 4.8 Documentation for a reviewer who has never seen the repo
**Problem**: the README is genuinely good for setup and demo flow, but says
nothing about architecture decisions this audit had to reverse-engineer from
scratch — that the vector store is in-memory and rebuilt from the DB on
every startup (not persisted, not a real vector DB despite the README's own
architecture diagram using the word "vector store"), that there is no
trained ML classifier despite "AI Suite" branding implying one to some
readers, or the exact mock-fallback contract that H1 found already broken
once.
**Fix**: add a short `ARCHITECTURE.md` covering the request flow for both
AI features end-to-end, stating plainly up front "complaint classification
is an LLM call with a keyword-heuristic mock fallback, not a trained model"
to set correct expectations immediately, and documenting the
mock-fallback contract precisely enough that a future contributor doesn't
accidentally reintroduce H1 while touching `ai_client.py`.
**Effort**: S. **Impact**: Medium — cheap, and would have directly
prevented this audit's own Phase 0 scoping confusion (discovering "no
classifier exists" from the code rather than being told it up front).

---

## 5. Top 5 things to fix first (ranked by impact ÷ effort)

1. **Fix the confirmed `content=None` crash (H1)** — one `if content is
   None:` guard in `ai_client.py:196` (mirroring the existing
   `finish_reason == "content_filter"` check) that falls back to the mock
   instead of returning `None`. Trivial change, closes a confirmed,
   reproduced bug that violates the codebase's own stated reliability
   promise.
2. **Add `timeout=` to both Groq call sites (M1)** — two one-line changes
   that turn a confirmed 16.2-second hang during a real network outage into
   a fast, clean fallback.
3. **Add `aria-hidden="true"` to `Icon.jsx` (M9)** — one line in one shared
   component, fixes an accessibility bug affecting every icon across the
   entire app.
4. **Wire up `react-markdown` for chat answers (L4)** — one dependency and
   a small component change, fixes visible formatting clutter in
   essentially every AI answer (confirmed present throughout Phase 4's
   eval transcripts).
5. **Fix `AuthContext`'s network-failure-vs-invalid-token conflation (M2)**
   — distinguish a fetch-level network error from an actual 401 before
   clearing the stored token; small, contained change in `client.js` +
   `AuthContext.jsx` that kills a real, confirmed, recurring UX bug.

**Next up after these five** (higher effort, still high-severity, worth
doing right after): the mobile sidebar layout (H2) and the dependency
version bumps + upload hardening (M5/M6) — both correctly rank just outside
strict impact/effort ordering only because they're Medium-effort rather than
Small, not because they're lower priority.

---

## 6. What could not be tested, and why

- **True separate-process/multi-worker concurrency.** Phase 3's 20-parallel
  test used `TestClient`'s in-process thread pool — a real test of Python
  thread-safety (directly relevant to the `vectorstore._state` concern), but
  not a true multi-process load test. A production deployment with multiple
  `uvicorn` workers would have separate, unshared `_state` per process — a
  different concern this audit didn't explore.
- **Color contrast ratios.** No automated tool (axe-core, Lighthouse) is
  installed in this project, and none was set up for this audit. Visual
  spot-checking of screenshots found nothing obviously failing, but that is
  explicitly not a substitute for a real measurement and is not reported as
  a pass.
- **Literal 375px mobile screenshot.** The browser-automation tool's window
  resize did not take effect in this session (confirmed on two separate
  tabs). The underlying bug (H2) was still confirmed with high confidence
  via the exact CSS values that determine the layout, which is
  deterministic regardless of whether a screenshot could be taken.
- **Real Groq rate-limiting (HTTP 429) behavior.** Invalid-key,
  network-down, and artificial-timeout failure modes were all tested with
  real network calls (Phase 4). A genuine 429 was not triggered, since doing
  so reliably would mean deliberately hammering the real API past its rate
  limit — wasteful of the user's API quota and not reliably triggerable
  on-demand in a short test window.
- **Load/stress testing at realistic production scale.** Only 20 concurrent
  requests were tested (per the brief's own spec). No sustained load,
  soak, or memory-leak testing was performed.
- **Cross-browser testing.** All frontend testing used a single Chrome
  instance. Firefox, Safari, and older browser behavior is untested.
- **Real assistive-technology testing.** Phase 5's accessibility check
  inspected the programmatic accessibility tree (which is how M9 was
  found) but did not run actual screen-reader software (NVDA/JAWS/VoiceOver)
  end-to-end.
- **Classifier accuracy/F1/confusion-matrix/train-test-leakage.** Not a
  testing gap — confirmed architecturally not applicable, since no trained
  classifier exists in this codebase (Phase 0, reconfirmed Phase 4).
- **Any real staging/production environment.** Every test in this audit ran
  against local dev instances (the original dev server, an isolated Phase 3
  test DB, and a fresh Phase 1 clone). No deployed environment exists to
  test against, consistent with §4.7's finding that deployment tooling
  itself doesn't exist yet either.

---

*End of audit. All phase branches, test files, eval data, and this report
live on `qa/full-audit`, not merged to `main`.*
