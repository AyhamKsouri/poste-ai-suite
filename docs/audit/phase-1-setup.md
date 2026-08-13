# Phase 1 — Build & Boot

Branch: `qa/full-audit`. Method: everything below was actually executed; commands
and real output are pasted, not summarized from reading code.

To get a faithful "does a fresh clone work from the README alone" answer, the
main dev instance (backend on :8000, frontend on :5173, holding our 9-document
RAG corpus from the corpus-expansion step) was **stopped**, a **brand-new
clone from GitHub** was built and booted in an isolated scratch directory on
the exact same ports using nothing but the README's instructions, and then the
main dev instance was **restarted** afterward (confirmed the SQLite DB and its
9-document corpus survived the restart, since the corpus lives on disk, not in
process memory beyond the TF-IDF index which is rebuilt from disk on startup).

---

## 1. Fresh clone

```
$ git clone https://github.com/AyhamKsouri/poste-ai-suite.git poste-fresh-clone
Cloning into 'poste-fresh-clone'...
$ git log --oneline -3
864696d feat(ui): use official La Poste Tunisienne logo
863debb docs: update progress report for the UI redesign and Groq migration
8ad1436 feat(ui): restyle Dashboard with real Chart.js charts
$ git branch --show-current
main
```

Clean clone of `main` @ `864696d`, isolated from the working repo (different
directory, different venv, different `node_modules`).

## 2. Backend install

```
$ python --version
Python 3.12.10
$ python -m venv venv
$ ./venv/Scripts/python.exe -m pip install -r requirements.txt
```

Full output: 37 packages resolved and installed cleanly from cache/wheels in
**32.3 seconds** (`real 0m32.261s`). **Zero warnings, zero errors**, aside from
pip's own routine "a new release of pip is available" notice (not a
dependency issue). Final line: `Successfully installed PyJWT-2.10.1
annotated-types-0.8.0 anyio-4.14.2 bcrypt-4.0.1 certifi-2026.7.22 ... fastapi-0.115.6`
(37 packages total).

```
$ ./venv/Scripts/python.exe -m pip check
No broken requirements found.
```

**No version conflicts.** All 14 pinned dependencies in `requirements.txt`
installed exactly as pinned, no resolver downgrades/upgrades needed.

## 3. Backend env + boot

Per README: `copy .env.example .env`, no manual edits (testing the documented
zero-key default path).

```
$ ./venv/Scripts/python.exe -m uvicorn app.main:app --reload
INFO:     Will watch for changes in these directories: [...\poste-fresh-clone\backend']
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [24308] using WatchFiles
INFO:     Started server process [24340]
INFO:     Waiting for application startup.
INFO:root:Seeded default admin account: admin@poste.tn / admin123
WARNING:root:GROQ_API_KEY is not set - RAG answers and complaint triage are running on
mock responses. Add a key to backend/.env to enable real Groq API calls.
INFO:     Application startup complete.
```

Every log line above is real, in order. **Cold boot time** (process launch to
`Application startup complete`) was on the order of **8-10 seconds** on this
machine — the reloader + server subprocess spawn plus first-import of
scikit-learn/numpy/scipy accounts for nearly all of it (an immediate `curl` at
t+3s got connection-refused; a `curl` at t+9s succeeded). Not scientifically
timed to the millisecond, but real, not estimated from reading code — a naive
"3 second sleep then curl" in this same test genuinely failed once before
succeeding on retry, which is itself a mildly useful data point: **the README
doesn't mention that first boot is noticeably slower than a warm reload**, so
someone following it literally and curling immediately after the "Uvicorn
running" line (which prints before the app is actually ready) could get a
false "it's broken" impression.

```
$ curl -s http://127.0.0.1:8000/
{"status":"ok","ai_enabled":false}     HTTP 200
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs
200
```

`ai_enabled: false` correctly reflects the empty `GROQ_API_KEY` in the
untouched `.env.example`-derived `.env` — matches documented behavior exactly.

## 4. Frontend install

```
$ node --version
v24.18.0
$ npm --version
11.16.0
```

README says "Node.js 18+"; this environment has v24.18.0. Works fine, but the
README doesn't pin/test against a specific version — noted, not a defect.

```
$ npm install
added 136 packages, and audited 137 packages in 6s

25 packages are looking for funding
5 vulnerabilities (3 moderate, 2 high)

npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn allow-scripts   esbuild@0.21.5 (postinstall: node install.js)
```

Install succeeded in **6.5 seconds**. Two things worth flagging, both
confirmed non-blocking by direct follow-up testing (not assumed):

- **`npm audit` reports 5 real vulnerabilities** (3 moderate, 2 high) in this
  exact dependency tree — full detail:
  - `esbuild <=0.24.2` (moderate) — dev server can be sent arbitrary requests
    and read responses by any website ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).
    Only affects `vite dev`/local dev server exposure, not the production
    build. Fix requires a breaking upgrade to `vite@8`.
  - `nanoid <3.3.17` (high) — infinite loop when called with `size=0`
    ([GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)).
    Fixable non-breaking via `npm audit fix`.
  - `react-router 6.0.0–7.17.0` (moderate ×2) — open redirect via backslash in
    `<Link>`/`useNavigate` and arbitrary constructor injection in
    `deserializeErrors()` during SSR hydration
    ([GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6),
    [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg)).
    This app is a client-only SPA (no SSR), so the SSR-hydration CVE doesn't
    apply to how it's deployed; the open-redirect one is worth a look. Fixable
    non-breaking via `npm audit fix`.
  Full remediation detail belongs in Phase 2 (static analysis); recorded here
  because it surfaced naturally during install and Phase 2 will re-run and
  confirm it rather than re-discover it.
- **The `allow-scripts` warning about `esbuild`'s blocked postinstall script**
  turned out to be harmless in this environment — verified directly:
  ```
  $ ls node_modules/@esbuild
  win32-x64
  $ node -e "require('esbuild'); console.log('esbuild loads OK')"
  esbuild loads OK
  ```
  The platform binary was present and the module loads. Not a defect, but
  worth knowing this warning can look scarier than it is.

## 5. Frontend boot + real connectivity test

```
$ npm run dev
  VITE v5.4.21  ready in 456 ms
  ➜  Local:   http://localhost:5173/
```

456ms cold start, zero warnings.

**Real request through the actual `/api` proxy** (not a direct backend call —
this exercises the exact path the browser app uses):

```
$ curl -s -X POST http://localhost:5173/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@poste.tn","password":"admin123"}'
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(truncated)","token_type":"bearer"}
HTTP 200

$ curl -s http://localhost:5173/api/auth/me -H "Authorization: Bearer <token>"
{"id":"c9374d70-ac0e-4dc2-9eab-13d4743a5535","email":"admin@poste.tn",
 "full_name":"Admin","role":"admin","office":null,
 "created_at":"2026-08-12T19:02:17.394987"}
HTTP 200
```

Confirmed: the frontend's Vite dev-server proxy correctly forwards `/api/*` to
the fresh backend on `:8000`, strips the prefix, and returns a real,
usable JWT that authenticates a real follow-up request. Full auth flow works
end-to-end on a completely fresh clone with zero manual configuration beyond
copying `.env.example`.

## 6. Undocumented steps required

**None.** A fresh clone runs correctly with only the README's literal
instructions — `venv` + `pip install` + `copy .env.example .env` + `uvicorn`
on the backend, `npm install` + `npm run dev` on the frontend. The only
adaptation made here was running the `venv`'s `python.exe`/`pip` directly from
Bash instead of activating via PowerShell's `Activate.ps1` — functionally
identical, not a missing or undocumented step, just a different shell calling
convention.

One soft documentation gap, not a functional blocker: the README doesn't
mention that the very first `uvicorn --reload` boot is markedly slower
(~8-10s) than the "Uvicorn running" banner suggests, because that banner
prints before scikit-learn finishes importing and the startup event finishes
seeding the DB. Someone testing readiness by curling immediately after seeing
that banner could wrongly conclude the server is broken.

## 7. Cleanup / restore

Fresh-clone backend and frontend processes were stopped; the main dev
instance (`C:\Users\ayham\Documents\poste-ai-suite`, branch `qa/full-audit`,
real `GROQ_API_KEY` set) was restarted on the same ports:

```
$ curl -s http://127.0.0.1:8000/
{"status":"ok","ai_enabled":true}    HTTP 200
```

Confirmed the 9-document RAG corpus (built in the corpus-expansion step)
survived the restart — `GET /rag/documents` returns exactly 9 documents,
matching the count before the restart. No data was lost by stopping/starting
the server, as expected (the corpus lives in SQLite on disk; the in-memory
TF-IDF index is rebuilt from disk on every startup).

---

## Summary

| Check | Result |
|---|---|
| Backend deps install clean | ✅ 32.3s, 0 warnings, 0 conflicts (`pip check` clean) |
| Backend boots on fresh clone | ✅ ~8-10s cold boot, all startup log lines captured |
| Frontend deps install clean | ⚠️ 6.5s install succeeds; **5 real vulnerabilities** reported by `npm audit` (detail above); one harmless `allow-scripts` warning (verified non-breaking) |
| Frontend boots on fresh clone | ✅ 456ms, 0 warnings |
| Frontend ↔ backend real connectivity | ✅ real login + real authenticated `/auth/me` call through the actual Vite proxy, both HTTP 200 with real payloads pasted above |
| Undocumented steps needed | **None** — README is accurate and sufficient as written |
| Main dev instance restored after test | ✅ `ai_enabled: true`, 9/9 documents confirmed present |

## STOP — end of Phase 1

Waiting for confirmation to continue to Phase 2 (static analysis: ruff, mypy,
ESLint setup from scratch, ~~tsc~~ N/A, secrets history scan, `pip-audit`,
`npm audit` remediation detail already partially gathered above).
