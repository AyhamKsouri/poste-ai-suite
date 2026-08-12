# Phase 5 — Frontend Testing

Branch: `qa/full-audit`. Tested with real browser automation (Chrome) against
the live dev instance, plus source-code verification for anything the browser
tooling in this environment couldn't directly observe (noted explicitly where
that applies — never presented as if visually confirmed when it wasn't).

---

## 1. Production build

```
$ npm run build
vite v5.4.21 building for production...
✓ 49 modules transformed.
dist/index.html                 0.88 kB │ gzip:   0.44 kB
dist/assets/logo-BBxhVITB.png   19.80 kB
dist/assets/index-mh-urpvP.css  21.33 kB │ gzip:   4.72 kB
dist/assets/index-BlwtiU2U.js  365.61 kB │ gzip: 120.25 kB
✓ built in 1.62s
```

**Succeeds cleanly, 1.62s, zero warnings.** Total gzipped payload ~125 kB —
well under Vite's 500 kB chunk-size warning threshold (which never fired).
Reasonable for a React 18 + Chart.js SPA.

## 2. Page-by-page walkthrough

| Page | Renders | Fetches correctly | Console errors | Notes |
|---|---|---|---|---|
| `/login` | ✅ | N/A | None | Pre-filled with demo creds (README-documented behavior); keyboard flow works (Tab moves email→password, Enter submits) |
| `/assistant` | ✅ | ✅ (real Groq answer, real sources) | None | See §3 for a real formatting bug found here |
| `/complaints` | ✅ | ✅ | None | See §4 for a display-inconsistency bug |
| `/complaints/:id` | ✅ | ✅ | None | Reply flow works end-to-end (draft → edit → send → status updates to `replied`); same display bug as list page, worse (see §4) |
| `/dashboard` | ✅ | ✅ (real Chart.js bar + donut charts, real numbers) | None | Same raw-category-label issue in the bar chart |
| `/documents` | ✅ | ✅ (all 9 corpus documents listed correctly) | None | Drag-and-drop UI renders correctly |

**Loading states**: confirmed present in source for `/complaints` (`"Analyse
IA en cours..."` with a spinner icon, button `disabled` during submit,
`"Chargement..."` while the list loads, `"Aucune réclamation."` empty state)
— **not caught on camera**, because real Groq responses in this environment
consistently return in under 1 second (matching Phase 4's timing data), too
fast for a screenshot taken immediately after the click to catch the
in-flight state. Verified the code path exists and is wired to the right
state variables rather than just assuming from the final rendered result.

**Empty states**: `"Aucune réclamation."` (complaints), example prompt text
shown when the assistant has no message history yet — both confirmed
present and rendering correctly.

## 3. Real bug found: AI-generated Markdown is not rendered

The assistant's answers frequently contain Markdown formatting (`**bold**`,
bullet lists, etc. — visible throughout Phase 4's eval transcripts). The chat
UI (`Assistant.jsx`) renders this as **plain text**, with no Markdown parser
(`react-markdown` or equivalent is not in `package.json`, confirmed in
Phase 0). Confirmed visually and via zoomed screenshot:

> Le dépôt initial minimum requis pour l'ouverture d'un compte CCP est de
> **5 dinars tunisiens**.

displays with the literal `**` asterisks visible to the user, not bold text.
**Low-medium severity, real UX degradation** — every answer with any
formatting (which is most of them, per Phase 4's transcripts) shows raw
syntax clutter instead of clean formatting.

## 4. Real bug found: complaint category/urgency/status labels are inconsistently translated

- **List page** (`Complaints.jsx`) correctly maps `urgency`/`status` through
  `URGENCY_LABEL`/`STATUS_LABEL` dictionaries (`high` → "Élevée", `reviewed`
  → "Analysé") — **but `category` is never mapped**, so the table always
  shows raw enum values (`lost_package`, `damaged_item`, `delivery_delay`,
  `billing`, `other`) directly in a French-language UI. Same raw values also
  appear in the Dashboard's "Réclamations par catégorie" bar chart labels.
- **Detail page** (`ComplaintDetail.jsx`) is worse: it doesn't apply *any* of
  the label maps, so **category, urgency, AND status all show raw English
  enum values** (confirmed live: "CATÉGORIE: lost_package", "URGENCE: high",
  "STATUT: reviewed", then "STATUT: replied" after sending a reply) even
  though the exact same data renders correctly translated ("Élevée",
  "Analysé") one click away on the list page.

**This is a real, confirmed inconsistency, not a design choice** — the
translation dictionaries already exist and work correctly in one place; they
just weren't reused in the other two. Low severity (doesn't block any
workflow, an agent can still infer meaning from context) but a visible
polish gap in a customer-facing-adjacent tool.

## 5. Double-submit

Rapid double-click on the Assistant's send button was tested live: only
**one** message was sent, only one response returned — no duplicate request,
no duplicate message bubble. Not a bug.

## 6. XSS via rendered model output

Tested directly in the browser, not just inferred from the absence of
`dangerouslySetInnerHTML` (confirmed in Phase 0's static grep):

```
Typed into the question box: <img src=x onerror="window.__xss_fired=true">Quel est le CCP?
```

The payload rendered as **literal visible text** in the chat bubble (`<img
src=x onerror="...">Quel est le CCP?` shown as-is, tag characters and all) —
confirmed via `window.__xss_fired === false` after submission and a visual
check of the DOM. React's default text-node escaping holds. **No XSS**,
confirmed live, not assumed.

## 7. Backend-down behavior (real test — backend actually stopped and pages actually reloaded)

Stopped the backend process, confirmed down (`curl` → connection refused),
then reloaded protected pages:

- **Every protected page** (`/complaints`, `/documents`, and by the same
  mechanism `/assistant`, `/dashboard`, `/complaints/:id`) **redirects to
  `/login`** on reload while the backend is unreachable. Root cause traced
  in `AuthContext.jsx:16-20`: on every mount, it calls `api.me()` to validate
  the stored token; the `.catch(() => setToken(null))` handler treats *any*
  failure — including a pure network error from an unreachable backend — the
  same as "invalid token," clearing it and forcing a fresh login.
  **This is a real, confirmed UX bug**: a backend outage silently logs the
  user out and discards a perfectly valid JWT, rather than showing "cannot
  reach the server" and preserving the session for when it comes back. A
  user who was mid-task when the backend blipped loses their session for no
  reason related to their actual authentication state.
- **Attempting to log in while the backend is down** does show a visible
  error ("Internal Server Error") rather than hanging — but the message is
  **misleading**: this isn't a server error (the server isn't running at
  all), it's a connection failure, most likely surfaced by Vite's dev proxy
  returning a generic 500 when it can't reach its upstream target
  (`vite.config.js`'s `/api` proxy to `:8000`). A message like "Impossible de
  contacter le serveur" would be more accurate and actionable.
- No console errors/unhandled exceptions were observed during any of this —
  the failure is caught and handled, just not accurately communicated or,
  in the AuthContext case, handled with the right *consequence*.

**Deeper source-level finding, not just this specific reload scenario**:
`Complaints.jsx`'s `load()` (`backend/../frontend/src/pages/Complaints.jsx:29-34`,
used both on mount and after every filter change) and `ComplaintDetail.jsx`'s
`load()` (lines 12-16) have **zero error handling** — no `try`/`catch` at
all. If a request fails for a reason that does *not* trigger `AuthContext`'s
logout path (e.g., a transient 500 from the backend while the token is still
valid, or the backend going down *after* the page already loaded rather than
on initial mount), `loading` would never be set back to `false` and the page
would show `"Chargement..."` **forever**, with no error message and no way
to recover short of a manual reload. This specific failure mode (backend
flaking mid-session rather than being down at page-load time) was not fully
reproduced live in this session — the `AuthContext` redirect intercepts the
more common down-at-reload case first — but the code path is real, confirmed
by reading, and is a genuine gap: `Complaints.jsx:41-52`'s `handleSubmit`
similarly has a `try`/`finally` with **no `catch`**, so a failed complaint
submission re-enables the button (via `finally`) but shows the user no
explanation of what went wrong.

## 8. Accessibility basics

- **Form labels**: `Login.jsx` uses proper semantic `<label htmlFor="email">`
  / `<label htmlFor="password">`, correctly associated — confirmed in source
  and via the accessibility tree.
- **Keyboard navigation**: confirmed live — Tab moves focus in a sensible
  order (email → password on the login form), Enter submits the form from
  the password field.
- **Real, systemic finding**: the shared `Icon` component
  (`frontend/src/components/Icon.jsx:5-11`) renders a Material Symbols
  ligature name (e.g. `"smart_toy"`, `"logout"`, `"person"`, `"lock"`,
  `"mark_email_read"`) as **literal text content** with no
  `aria-hidden="true"`. Confirmed via the accessibility tree: the Assistant
  nav link's accessible content is literally `"smart_toy" + "Assistant"` —
  a screen reader would announce the raw icon identifier alongside every
  visible label, on every icon in the app (nav items, buttons, form field
  icons, the logout button, etc.), since `Icon` is used pervasively and
  never marked decorative. **Real, actionable accessibility bug** — the fix
  is a one-line change (`aria-hidden="true"` on the icon `<span>`), but it
  affects every screen-reader-using visitor's experience of the entire app.
- **Color contrast**: not measured with an automated tool (no
  axe-core/Lighthouse run — none is set up in this project, and none was
  installed for this audit). Visual inspection of all captured screenshots
  shows generally high-contrast pairings (white text on dark navy sidebar,
  dark text on white/light backgrounds, red error text on white) with no
  obviously-failing combination spotted, but this is **not a substitute for
  a real contrast-ratio check** and should not be reported as a pass.

## 9. Mobile viewport (375px)

**Partially blocked by a tool/environment limitation, not the app**: the
browser automation's `resize_window` call reported success but did not
actually change the viewport in this session (`window.innerWidth` stayed at
1536px both on the existing tab and on a freshly created one — tested twice
to rule out a one-off glitch). No visual 375px screenshot could be captured
as a result.

**However, a real, high-confidence, source-verified finding was made
without needing the visual test**: `Layout.jsx:38,99` sets the sidebar `nav`
to `position: fixed` at a hardcoded `w-sidebar-width` (`260px`, defined in
`tailwind.config.js:65`), and the `main` content area to `margin-left:
260px` (`ml-sidebar-width`) — with **no responsive override at any Tailwind
breakpoint** (`grep` for `md:`/`sm:`/`lg:` in `Layout.jsx` returns zero
matches, confirmed). On a 375px-wide viewport, this arithmetic is
unambiguous: the fixed sidebar alone consumes 260px (69% of the viewport),
leaving only **115px** for all page content — chat bubbles, tables, forms,
charts. This is a CSS layout fact, not a rendering guess; it doesn't depend
on the browser tool cooperating to be true. **High-severity, real mobile
usability defect**, confirmed via the exact CSS values that determine
layout, even though a literal photograph of it wasn't obtainable in this
session.

Four of the six page files (`AdminDocuments.jsx`, `Complaints.jsx`,
`Dashboard.jsx`, `Login.jsx`) do use `sm:`/`md:`/`lg:` responsive classes
internally for their own content layout — but all of that is moot on a real
phone screen given the sidebar issue above, since `Layout.jsx` wraps every
authenticated page and never lets content use more than the ~115px left
over. `Assistant.jsx`, `ComplaintDetail.jsx`, and `Layout.jsx` itself have no
responsive classes at all.

---

## Summary

| Check | Result |
|---|---|
| Production build | ✅ Clean, 1.62s, 125 kB gzipped, no warnings |
| Every page renders + fetches | ✅ All 6 pages confirmed live, zero console errors across the entire session |
| Loading/empty states | ✅ Present in code, loading state not visually caught (Groq responses too fast, <1s) |
| Markdown rendering in AI answers | ❌ **Bug** — raw `**`/list syntax shown to users, no Markdown parser |
| Category/urgency/status label consistency | ❌ **Bug** — list page translates urgency/status but not category; detail page translates nothing |
| Double-submit | ✅ No duplicate requests observed |
| XSS via model output | ✅ Confirmed blocked live (payload rendered as literal text, `onerror` never fired) |
| Backend-down (reload) | ⚠️ Fails somewhat gracefully but **silently logs the user out** on any network error, even with a still-valid token — confirmed live, root cause traced |
| Backend-down (mid-session) | ⚠️ `Complaints.jsx`/`ComplaintDetail.jsx` `load()` and `handleSubmit()` have **zero error handling** — would hang on `"Chargement..."` forever or fail silently; confirmed via source, not fully reproduced live in this session |
| Accessibility — labels | ✅ Login form correctly uses semantic `<label>` |
| Accessibility — keyboard nav | ✅ Confirmed live (Tab order, Enter-to-submit) |
| Accessibility — icons | ❌ **Bug** — every icon app-wide announces raw ligature text to screen readers, no `aria-hidden` |
| Accessibility — contrast | Not measured (no tooling available; visual spot-check only, not a substitute) |
| Mobile viewport 375px | ⚠️ Visual test **blocked** by a browser-automation tool limitation (window resize didn't take effect); **high-confidence bug found anyway via source**: fixed 260px sidebar with zero responsive override leaves ~115px for content on a phone screen |

## STOP — end of Phase 5

Waiting for confirmation to continue to Phase 6 (final report — executive
summary, full findings list by severity, improvements roadmap, top 5 fixes
ranked by impact/effort, and the explicit list of everything that couldn't
be tested).
