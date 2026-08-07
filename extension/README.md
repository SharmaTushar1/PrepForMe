# PrepFor.Me — browser extension

Tailors your resume to the job posting in the current tab, then fills the
application form for you. You review every field yourself; this never clicks
a submit button.

This is a Manifest V3 Chrome extension that talks directly to the **same**
Supabase project and Edge Functions as the main app (`../src/lib/ai/edge.ts`,
`supabase/functions/tailor-resume`) — there is no separate backend.

## How it fits together

```
extension/
  src/
    background/index.ts   service worker — owns the Supabase session, refreshes
                           the access token, relays "open panel" clicks
    content/
      bridge.ts            runs ONLY on the PrepFor.Me web app's own origin;
                           reads the Supabase session already in that tab's
                           localStorage and hands it to the background worker
      detect.ts            figures out what site this is and scrapes a best
                           guess at company / role / job description
      autofill.ts           fills the form: fixed Greenhouse field ids first,
                           then a label-matching sweep for everything else
      panel.tsx             mounts the on-page UI into a Shadow DOM
    panel/
      App.tsx               the state machine: idle → scanning → gap review
                           → generating → result → filling → done
      Root.tsx               floating launcher + open/close
      ui.tsx, theme.ts       small UI primitives, shared with the mockup's
                           colors in `../src/components/ExtensionPopup.tsx`
    lib/
      api.ts                 REST + Edge Function calls (fetch-based, no
                           supabase-js — see "Why no supabase-js" below)
      config.ts               env vars baked in at build time
      types.ts                mirrors of `../src/types.ts` / `.../ai/types.ts`
  public/manifest.json         MV3 manifest (copied to dist/ as-is)
  scripts/build.mjs            three separate Vite builds — see below
```

## Sign-in: no separate login screen

The extension has no email/password or OAuth flow of its own. Instead, a
content script that only runs on the PrepFor.Me web app's own origin
(`localhost:5173` or `prep-for-me.vercel.app`, see `matches` in
`manifest.json`) reads the Supabase session Supabase already put in that
tab's `localStorage` and hands the tokens to the background service worker.
So: **keep a PrepFor.Me tab open and signed in**, and the extension picks up
that session on any other tab. Signing out of the web app doesn't currently
push a sign-out to the extension mid-session — reload the job-site tab if you
switch accounts.

If you change `VITE_APP_ORIGINS` below to something other than the two
defaults, also update the two origin lists in `public/manifest.json`
(`content_scripts[0].matches` and the `exclude_matches` on the second entry) —
the manifest is a static file, not templated from `.env` at build time.

## Why no supabase-js

The main app's own `api/render-resume-pdf.ts` has a comment explaining why it
talks to Supabase Auth over plain `fetch` instead of importing
`@supabase/supabase-js`: instantiating that client spins up Realtime, which
has bitten this codebase once already in a non-browser-window context (see
git history: "fix: verify PDF auth without supabase-js Realtime"). The
extension's background service worker is exactly that kind of context — no
`window`, can be killed and restarted by Chrome at any time — so it and
`lib/api.ts` use hand-rolled `fetch` calls against the PostgREST (`/rest/v1`),
Auth (`/auth/v1`), and Functions (`/functions/v1`) endpoints instead. Smaller
bundle, too.

## Setup

```bash
cd extension
npm install
cp .env.example .env.local   # fill in the SAME Supabase project as the main app
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `extension/dist/`.

`npm run dev` runs the same three builds in Vite's `--watch` mode — reload the
unpacked extension in `chrome://extensions` (and refresh any open tab) after
each rebuild; there's no HMR into a live page for a MV3 content script.

### Config

| Var | What it's for |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Same values as the main app's `.env.local`. |
| `VITE_APP_ORIGINS` | Where the session bridge is allowed to read a session from. Keep in sync with `manifest.json` (see above). |
| `VITE_API_BASE` | Base URL for `/api/render-resume-pdf`, used to attach a tailored-resume PDF to Greenhouse's file input. |

## What actually works today

- **Tailoring**: real — calls `tailor-resume` (modes `tailor` / `enrich` /
  `edit`) exactly like the web app's Materials tab, against an `applications`
  row the extension creates or reuses by posting URL. Skill-gap prompts,
  keyword chips, and the "tweak this version" follow-up all hit the real
  model.
- **Autofill — Greenhouse**: fixed element ids (`#first_name`, `#email`, …)
  for the classic embed form, plus the resume PDF auto-attached to the file
  input via the `DataTransfer` trick (`autofill.ts`), then a label-matching
  sweep for whatever per-posting custom questions Greenhouse doesn't give
  stable ids to.
- **Autofill — everywhere else**: the same label-matching sweep alone: reads
  each visible field's `<label>`/`aria-label`/placeholder text and matches it
  against a small dictionary (name, email, phone, location, LinkedIn/GitHub/
  portfolio links, notice period, work authorization). Free-text prompts like
  "why do you want to work here" or salary expectations are deliberately
  **never** guessed at — they're listed as flagged instead, same as the
  design's "needs your voice" note.
- **Detection**: Greenhouse is recognised by hostname/embed marker; any other
  site is treated as a job posting only if it has a file input near words
  like "resume" and "apply" — otherwise the extension shows nothing until the
  toolbar icon is clicked to force it open.

## Known gaps (by design, for a first version)

- **LinkedIn Easy Apply, Workday, Lever**: no field-mapping yet. The generic
  label-matching sweep still runs on them and may fill a few fields, but
  don't expect the coverage Greenhouse gets.
- **Job-description scraping on unknown sites** is a heuristic (largest
  content block, `og:title`/`og:site_name`, title-splitting) and will
  sometimes get the company or role wrong — that's why the idle screen shows
  them as editable text fields instead of read-only labels.
- **Session sync is one-directional and polling-based** (every 4s, from the
  web-app tab's `localStorage`), not a live push — signing in on the web app
  takes a few seconds to reach a job-site tab that's already open.
- No E2E test against a real Greenhouse posting yet — this was built and
  typechecked, not click-tested against a live job board from this
  environment. Load it unpacked and try it on a real Greenhouse posting
  before relying on it.
