# Phase 2 — Static Analysis

Branch: `qa/full-audit`. Every finding below comes from an actually-executed
tool run with real output; nothing here is inferred from reading code alone
(Phase 0 already did the reading-based pass).

Tooling note: none of `ruff`, `mypy`, `pip-audit`, `eslint` existed in this
project before this audit (confirmed in Phase 0 §9). They were installed as
disposable dev tooling — `ruff`/`mypy`/`pip-audit` into `backend/venv`
(git-ignored, not persisted to `requirements.txt`), and ESLint in a throwaway
npm environment under the session scratchpad (**outside** `poste-ai-suite`
entirely) because ESLint 9's flat-config resolution requires plugins to be
resolvable from the config file's own directory, and a flat config also
refuses to lint files outside its own base path — so a temporary read-only
copy of `frontend/src` was linted from there. The actual ESLint config used
is committed at `docs/audit/eslint.config.mjs` (allowed location) as the
source of truth; no file was added to `frontend/` itself, and nothing in the
real `frontend/node_modules` or `package.json`/`package-lock.json` was
touched.

---

## 1. ruff (backend)

```
$ ./venv/Scripts/python.exe -m ruff check app --statistics
32  B008    function-call-in-default-argument
 2  DTZ003  call-datetime-utcnow
 2  I001    unsorted-imports
 2  LOG015  root-logger-call
 1  BLE001  blind-except
 1  F401    unused-import
Found 40 errors.
```

**32 of the 40 (B008) are false positives for this codebase**, not real bugs.
`B008` objects to calling a function inside an argument default
(`db: Session = Depends(get_db)`), which is *the* standard, documented
FastAPI dependency-injection idiom — ruff's default rule set doesn't know
about FastAPI's DI system. Every route handler in `auth.py`, `rag.py`,
`complaints.py` does this on purpose. Not a finding.

**The remaining 8 are real, small issues:**

| Rule | Count | file:line | What |
|---|---|---|---|
| BLE001 | 1 | `app/routers/rag.py:72` | `except Exception: document.status = "failed"` swallows the real error with **zero logging** — if a document upload fails during text extraction/chunking, there is no way to find out why afterward. Contrast with `ai_client.py:143,197`, which correctly call `logger.exception(...)` before falling back (ruff didn't flag those, confirming they're fine). |
| F401 | 1 | `app/routers/rag.py:4` | `from datetime import datetime` imported but never used — dead import. |
| DTZ003 | 2 | `app/auth.py:28`, and one more | `datetime.utcnow()` — naive (timezone-unaware) datetime, deprecated since Python 3.12. Used for JWT `exp` claims; not a security bug today (comparison is internally consistent since `jwt` also uses naive UTC), but a correctness landmine if any code ever compares this against a timezone-aware datetime. |
| LOG015 | 2 | `app/main.py:45,55` | Logging via the root logger (`logging.info(...)`) instead of a module logger (`logging.getLogger(__name__)`, already used correctly in `ai_client.py`) — cosmetic/consistency only. |
| I001 | 2 | `app/routers/auth.py:1`, `app/schemas.py:1` | Import ordering — cosmetic, auto-fixable. |

## 2. mypy (backend)

```
$ ./venv/Scripts/python.exe -m mypy app --ignore-missing-imports
Found 12 errors in 4 files (checked 15 source files)
```

Most are minor typing-strictness noise, but **two are genuine, plausible
correctness risks** that mypy surfaced by reasoning about types the runtime
code doesn't explicitly guard against:

- **`app/services/ai_client.py:196`** — `return choice.message.content` inside
  `answer_question()`, whose signature promises `-> str`. The Groq SDK types
  `choice.message.content` as `str | None`. The code only special-cases
  `finish_reason == "content_filter"` (line 193) before returning; if Groq
  ever returns a response with `content=None` under any *other* finish reason
  (empty completion, a tool-call-shaped response, etc.), this returns `None`
  straight out of the `try` block — **not** through the `except Exception`
  fallback, because returning `None` doesn't raise. Downstream,
  `AskResponse.answer` is declared as a non-optional `str`
  (`backend/app/schemas.py:67`), so FastAPI's response-model validation would
  reject it and the endpoint would 500 — directly contradicting the explicit
  design goal stated in `ai_client.py`'s own module docstring: *"this
  endpoint should never 500 because of an AI provider hiccup."* This is a
  **plausible, not confirmed** defect — reproducing it needs a mocked Groq
  response with `content: None`, which is a Phase 3/4 test, not something
  static analysis alone can prove happens in practice. Flagging it now
  because mypy caught a real gap between the code's implicit contract and
  what it actually guarantees.
- **`app/services/vectorstore.py:36,56,67,68`** — the module-level `_state`
  dict has no type annotation, so mypy infers `_state["vectorizer"]` /
  `_state["matrix"]` as `list[Any] | None` (from the dict's other default
  values) and can't confirm `.transform()`/indexing is safe. At runtime the
  `if _state["vectorizer"] is None: return []` guard on `vectorstore.py:53`
  makes this safe *today*, but there's no type-level enforcement — a future
  edit could remove or reorder that guard and mypy would have no way to catch
  it. Structural risk, not an active bug.

The remaining findings (`complaints.py:87`, `rag.py:39,47,57`,
`ai_client.py:142,190`) are mostly mypy being unable to see through
SQLAlchemy query filters or FastAPI's `UploadFile.filename: str | None`
typing; `rag.py:39` in particular (`os.path.basename(file.filename)` where
`file.filename` can genuinely be `None` per FastAPI's own type stubs, for a
multipart upload with no filename part) is worth a real Phase 3 test — if
true, `POST /rag/documents` with a filename-less multipart body would crash
with an unhandled `TypeError` before reaching the `try/except` that starts at
line 56, since line 39 executes earlier, unguarded.

## 3. ESLint (frontend)

No functional bugs. **11 total findings, all style/best-practice, zero of
them affect runtime behavior:**

- **4× `react-hooks/set-state-in-effect`** — `AuthContext.jsx:13`,
  `AdminDocuments.jsx:31`, `ComplaintDetail.jsx:19`, `Complaints.jsx:37`. This
  is React's newest, stricter lint rule objecting to the extremely common
  `useEffect(() => { load() }, [deps])` data-fetch-on-mount pattern used
  consistently across every page in this app. It works correctly at runtime
  (confirmed by using the actual app in Phase 1/earlier sessions) — this is a
  forward-looking style opinion from the React team, not a defect.
- **7× `react/no-unescaped-entities`** — raw `'` apostrophes in French JSX
  text: `Assistant.jsx` (×2, lines 154/176), `ComplaintDetail.jsx` (×2, lines
  102/103), `Complaints.jsx` (×2, both on line 60), `Dashboard.jsx` (×1, line
  76). 7 entity findings + 4 hook findings = the tool's reported 11 total.
  Purely a linter-hygiene rule about raw `'` in JSX text nodes;
  React renders these correctly as-is (JSX text is not HTML source, so this
  cannot cause any rendering bug), it's a documentation/consistency
  convention only.

`tsc --noEmit` — **N/A, not run.** Confirmed in Phase 0: this is a pure
JavaScript project, no TypeScript anywhere, no `tsconfig.json`. The tool does
not apply; this is not a gap, there's nothing for it to check.

## 4. Secrets scan (full git history, all 25 commits)

```
$ git log --all --oneline | wc -l
25
```

Small history, checked exhaustively rather than sampled:

- **No `.env` file was ever committed**, at any point in history
  (`git log --all --diff-filter=A --name-only | grep '\.env$'` → empty).
- **No Groq API key pattern** (`gsk_...`) anywhere in history.
- **No Anthropic API key pattern** (`sk-ant-...`) anywhere in history — worth
  checking specifically because commit `c84c4e7` ("integrate Claude API with
  structured outputs and offline fallback") shows the project originally used
  the Anthropic API before migrating to Groq (commit visible via
  `git log --all -p -- backend/.env.example`, which shows
  `ANTHROPIC_API_KEY=` → `GROQ_API_KEY=` — both **always committed empty**,
  never with a real value, across every version of that file).
- **No generic high-entropy secret-looking assignment** (`api_key=`,
  `secret=`, `password=`, `token=` followed by a 16+ char quoted string),
  excluding the known, intentional placeholder defaults
  (`dev-only-secret-change-me`, `change-this-to-a-random-secret-in-production`,
  `admin123`).
- **No AWS keys, no PEM/private-key blocks, no other provider key patterns.**
- Two apparent "phone number" regex hits were false positives on substrings
  of git commit hashes (`c46bd89082b04173521c...`, `312f3bc207364206589...`),
  verified by inspecting context, not assumed.
- The only email addresses appearing anywhere in history are
  `admin@poste.tn` (the documented seeded demo account),
  `ayhamksouri@gmail.com` (the repo author's own git commit `Author:` line —
  normal commit metadata, not a leak), `noreply@anthropic.com` (this audit's
  own commit co-author trailers), and `prenom.nom@poste.tn` (a French
  "firstname.lastname" placeholder string, not a real address).

**Conclusion: clean.** No secrets, keys, tokens, or real internal Poste
Tunisienne data found anywhere in the tracked history.

## 5. Dependency vulnerabilities

### Backend — `pip-audit`

```
$ ./venv/Scripts/python.exe -m pip_audit -r requirements.txt
Found 65 known vulnerabilities in 5 packages
```

The raw "65" figure double-counts several advisories that appear under
multiple IDs from overlapping data sources. Deduplicated by unique advisory
ID:

| Package | Installed | Unique advisories | Fix versions available |
|---|---|---|---|
| `pypdf` | 5.1.0 | **37** | 6.0.0 – 6.9.2 (many incremental releases) |
| `pyjwt` | 2.10.1 | 7 | 2.12.0 – 2.13.0 |
| `starlette` | 0.41.3 | 7 | 0.47.2 – 1.3.1 |
| `python-multipart` | 0.0.19 | 6 | 0.0.22 – 0.0.31 |
| `python-dotenv` | 1.0.1 | 1 | 1.2.2 |

**Raw count ≠ real exploitable risk here** — assessed each against how this
app actually uses the dependency, not just that a CVE exists:

- **`pypdf` (37 advisories)** is overwhelmingly the largest number, consistent
  with a PDF-parsing library many minor versions behind (5.1.0 vs. current
  6.15.x) accumulating malformed-input crash/DoS/ReDoS advisories over time —
  typical for this class of library. **This one matters**: `POST
  /rag/documents` accepts arbitrary uploaded files (including `.pdf`, handled
  by `extract_text()` → `pypdf.PdfReader`, `backend/app/services/documents.py:9-13`)
  with **no file-size cap and no content validation** (already flagged in
  Phase 0). A malicious or malformed PDF handed to a 14-versions-outdated
  parser, on an endpoint that already lacks basic upload hardening, is a
  real, compounding risk — tempered only by the fact upload is admin-only
  (`require_admin`), so this is an insider-threat/defense-in-depth issue, not
  an anonymous attack surface.
- **`python-multipart` (6 advisories)** includes real DoS vectors reachable
  by *any* client sending `multipart/form-data` — e.g. PYSEC-2026-3038/3039/
  3040 (large preamble/epilogue parsing, no cap on header count, negative
  `Content-Length` turning a bounded read into read-until-EOF). Whether these
  are reachable **pre-authentication** depends on FastAPI/Starlette's
  dependency-resolution order relative to body parsing for the `file:
  UploadFile` parameter on `POST /rag/documents` — not verified here, this is
  a Phase 3 test (send a malformed multipart body with no/bad auth and see
  what breaks first).
- **`pyjwt` (7 advisories)**: the app uses HS256 with a static shared
  `SECRET_KEY` (`backend/app/auth.py:16,30,40`) and pins
  `algorithms=[ALGORITHM]` explicitly on decode — a good practice that
  already blocks the classic JWT algorithm-confusion attack class. Most of
  the 7 advisories (PYSEC-2026-175/176/177/179) are specifically about
  `PyJWKClient` (remote-JWKS-fetching for asymmetric/RS256 verification) —
  **this app never uses `PyJWKClient`**, so those don't apply to how it's
  actually used. PYSEC-2026-120 (unvalidated `crit` header) and
  PYSEC-2025-183 (disputed by the vendor, key-strength is an app choice not a
  library bug) are the two that are theoretically relevant to HS256 decode,
  low practical severity given this app only ever decodes tokens it issued
  itself.
- **`starlette` (7 advisories)**: PYSEC-2026-1942 (quadratic-time `Range`
  header parsing in `FileResponse`) doesn't apply — this app has no file
  download/`FileResponse` endpoint anywhere (confirmed: `rag.py` only
  uploads/lists/deletes documents, never serves file bytes back).
  PYSEC-2026-161/248 (unvalidated `Host` header used to reconstruct
  `request.url`) is only a risk if the app uses `request.url` for redirects
  or emails — it doesn't, based on a grep for `request.url` across `app/`
  (no matches). PYSEC-2026-2281 (Windows UNC-path SSRF via `StaticFiles`) —
  this app never mounts `StaticFiles`. The multipart-form-parsing ones
  (PYSEC-2026-249/1941) are the most relevant, overlapping with the
  `python-multipart` concern above.

**Bottom line: upgrading `pypdf` to latest 6.x is the single highest-value
fix** (resolves the bulk of the unique-advisory count and directly hardens
the one endpoint already flagged as under-validated). The others are real
but mostly not reachable given how this specific app uses each dependency —
noted for the improvements list in the final report, not all equally urgent.

### Frontend — `npm audit`

Already run in Phase 1 (not re-run here, nothing in `frontend/package.json`
changed since): **5 vulnerabilities** — `esbuild` (moderate, dev-server-only
request/response exposure), `nanoid` (high, DoS via infinite loop on
`size=0`), `react-router`/`react-router-dom` ×2 (moderate — open redirect via
backslash in `<Link>`/`useNavigate`, and an SSR-hydration constructor
injection that doesn't apply since this is a client-only SPA with no SSR).

Checked whether the open-redirect CVE is actually reachable in this app: every
`useNavigate()`/`<Link to=...>` call in `frontend/src` uses either a hardcoded
literal path (`/assistant`, `/login`, `/complaints`) or a path built from a
**server-issued** UUID (`` `/complaints/${c.id}` `` in `Complaints.jsx:154`,
`ComplaintDetail.jsx:40`) — never raw, attacker-controlled input. **Not
exploitable in this app's current usage**, though still worth the
non-breaking `npm audit fix` since it's a free, zero-risk upgrade.

## 6. Code-quality flags requested by the brief

- **Functions >80 lines**: **none.** Verified with an AST-based scan (not
  eyeballing) across every backend `.py` file — the single longest function
  in the entire backend is `upload_document`
  (`backend/app/routers/rag.py:33`) at **47 lines**, well under the
  threshold. Frontend/JSX wasn't AST-scanned (no JS parser set up for this),
  but every page file is under 200 lines total with multiple functions each,
  making an 80-line function very unlikely — flagging this as a lighter-
  confidence check than the AST-verified Python one, not claiming full parity.
- **Bare `except:`**: none found (Python's true bare `except:` with no
  exception type doesn't appear anywhere). Three `except Exception:` blocks
  exist (broad, but not bare) — two properly logged
  (`ai_client.py:143,197`), one silently swallowed (`rag.py:72`, already
  flagged in §1).
- **Missing input validation**: `ComplaintCreate.raw_text`, `AskRequest.question`,
  and every other free-text Pydantic field has **no `max_length` constraint**
  anywhere in `backend/app/schemas.py` — confirmed by reading the full file
  in Phase 0, re-confirmed here since it's directly relevant to this phase's
  "missing input validation" ask. To be exercised for real in Phase 3
  (oversized payload test).
- **Hardcoded paths**: none found in either `backend/app` or `frontend/src`
  (grepped for `C:\`, `/home/`, `/Users/` — zero matches in both).
- **Hardcoded French/Arabic UI strings**: **confirmed, by design, not a
  bug.** Every user-facing string in the frontend is inline French text
  directly in JSX — no i18n library anywhere (`frontend/package.json` has no
  `react-i18next`/`next-intl`/equivalent, confirmed in Phase 0). Fine for an
  internal-tool MVP scoped to French-speaking staff, but worth noting as
  architectural debt for the improvements list — Tunisia's other official
  language is Arabic, and the backend's own AI prompts explicitly support
  answering "in the same language as the question" (`ai_client.py:58`), so
  the backend is more multilingual-ready than the hardcoded-French frontend
  chrome around it.
- **Duplicated logic**: no exact duplication found. The closest thing is the
  repeated `useEffect(() => { load() }, [...])` fetch-on-mount shape used
  identically across 4 frontend pages (already noted in the ESLint section)
  — small, idiomatic, arguably fine as-is; a shared `useFetch`/`useApi` hook
  would remove the repetition but isn't a correctness issue.

---

## Summary

| Check | Result |
|---|---|
| ruff (backend) | 40 raw findings, 32 are FastAPI-idiomatic false positives; 8 real (1 swallowed exception w/ no logging, 1 dead import, 2 naive-datetime, 2 root-logger, 2 cosmetic import-order) |
| mypy (backend) | 12 findings; 2 are genuine plausible defects (possible-`None` return breaking the "never 500s on AI hiccup" guarantee; a filename-can-be-`None` crash path in upload), rest are type-narrowing noise/false positives |
| ESLint (frontend) | 11 findings, **0 functional bugs** — all style/best-practice opinions |
| `tsc --noEmit` | N/A — no TypeScript in this project |
| Secrets, full history (25 commits) | **Clean** — no keys, tokens, passwords, or real internal data ever committed |
| `pip-audit` (backend) | 65 raw / ~58 unique advisories across 5 packages; `pypdf` (37) dominates and is the highest-value fix given the unvalidated-upload endpoint it feeds; most `pyjwt`/`starlette` advisories don't apply to how this app actually uses those libraries |
| `npm audit` (frontend) | 5 vulnerabilities (from Phase 1); open-redirect CVE confirmed **not reachable** in this app's actual `<Link>`/`navigate()` usage; still worth the free non-breaking fix |
| Functions >80 lines | **None** (AST-verified for Python; lighter-confidence for JS) |
| Bare `except:` | None; 1 of 3 broad `except Exception:` blocks silently swallows errors |
| Missing input validation | Confirmed — no `max_length` on any free-text field |
| Hardcoded paths | None |
| Hardcoded French strings | Confirmed, by design (no i18n anywhere) |
| Duplicated logic | None significant |

## STOP — end of Phase 2

Waiting for confirmation to continue to Phase 3 (backend functional testing —
pytest suite per endpoint, including the two follow-ups this phase surfaced:
forcing a mocked `content=None` Groq response to check the "never 500s" claim,
and uploading a multipart request with no filename to check the
`os.path.basename(None)` crash path).
