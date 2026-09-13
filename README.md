# PrepFor.Me

A war room for high-intent job applications. PrepFor.Me tailors your resume
truthfully to each role, builds company-specific interview prep that compounds
with every recap you log, and keeps you in charge — nothing is ever auto-submitted.

This repo is meant to be **open source**. A hosted instance (when it exists) can
charge for the cloud model, storage, and ops. **Self-hosting stays yours:** run
the same app locally against a local LLM (Ollama) or against **your own** API
keys (Anthropic + OpenAI). Nothing in the product requires the hosted billing
path.

**Live:** https://prep-for-me.vercel.app/ — pre-v1, a working CRUD skeleton.

## Documentation

| Doc | What's in it |
| --- | --- |
| [PROJECT.md](PROJECT.md) | **The source of truth.** What the product is, the moat, scope and non-scope, decisions, current state, open questions, version history. |
| [TECHNICAL.md](TECHNICAL.md) | Stack, hosting, environment, code layout, data model, migrations, deploy, and the gotchas that have already cost time. |
| [AGENTS.md](AGENTS.md) | Conventions and invariants for anyone — human or agent — changing this repo. |

## Stack

React 18 + TypeScript, built with Vite. Supabase for Postgres, magic-link and Google
auth, and later Edge Functions. TanStack Query for server state, React Router for navigation. No
UI framework: inline style strings are parsed into React style objects by
[`src/css.ts`](src/css.ts), so oklch colors and gradients stay exactly as designed.

## Getting started

You need **Docker** (Docker Desktop, or Colima on a Mac) and the
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
`npm run dev` alone is the UI — Postgres, auth, and AI live in other processes.

```bash
npm install
cp .env.example .env.development.local
# After `supabase start`, copy API URL + publishable key from `supabase status`
# into .env.development.local. Set VITE_AI_PROVIDER=edge to talk to functions.

supabase start                 # Docker stack: API :54321, Studio :54323, inbox :54324
npm run dev                    # http://localhost:5173  — use localhost, not 127.0.0.1
```

The app boots without credentials — the landing page renders and the sign-in screen
tells you what's missing — so a blank env file never crashes anything.

`supabase start` does **not** serve Edge Functions. Those are a second process; see
[Running AI locally](#running-ai-locally).

### What has to be running

| Process | Command | Needed for |
| --- | --- | --- |
| Docker VM | `colima start` / Docker Desktop | local Supabase |
| Supabase stack | `supabase start` | auth, DB, storage |
| Vite | `npm run dev` | the web app |
| Functions | `supabase functions serve --env-file …` | any real AI (analyze, tailor, prep chat) |
| Model backend | Ollama + bridge, **or** Anthropic via `.env.local` | what the functions call |

### First-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run every file in [`supabase/migrations/`](supabase/migrations) in filename order, via
   the SQL editor or `supabase db push`. `0003_grants.sql` is not optional — without it
   the tables exist and every query still fails with `42501`
   ([why](TECHNICAL.md#7-migrations-and-the-grants-rule)).
3. Copy the project URL from **Settings → API** and the `sb_publishable_…` key from
   **Settings → API Keys** into `.env.local`. Both are safe in the browser; row level
   security is what protects the data.
4. In **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:5173` and add `http://localhost:5173/**` to the redirect allow list,
   or magic links / OAuth will send you somewhere that isn't your dev server.
5. **(Recommended) Google sign-in** — see [Sign-in with Google](#sign-in-with-google) below.
6. Sign in at `/login`. The first sign-in creates your account, and a trigger seeds your
   `profiles` and `user_settings` rows.

### Sign-in with Google

The login screen offers **Continue with Google**, plus the
email magic link. You create the OAuth apps; Supabase holds the secrets (never `VITE_`).

**1. Google Cloud Console** → APIs & Services → Credentials → Create OAuth client ID (Web):

- Authorized JavaScript origins: `http://localhost:5173`, `https://prep-for-me.vercel.app`
- Authorized redirect URIs (both):
  - Local: `http://127.0.0.1:54321/auth/v1/callback`
  - Hosted: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

**2. Hosted Supabase** → Authentication → Providers → enable Google → paste
client id + secret for each.

**3. Local** — add to `supabase/.env` (or `.env.local` loaded by the CLI; not the Vite
`.env.local`):

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

Then `supabase stop && supabase start` so GoTrue picks up `[auth.external.*]` from
[`supabase/config.toml`](supabase/config.toml).

Redirect allow-list must include `${origin}/app` (already required for magic links).

Scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

### Running AI locally

The hosted product can bill for cloud inference. Locally you pick the backend.
Every generation call (analyze, rewrite, tailor, prep chat, ingest extraction)
goes through `${ANTHROPIC_BASE_URL}/v1/messages`. Point that at Anthropic or at a
local Ollama bridge.

`supabase start` does **not** inject model keys. Serve functions yourself, from a
file that process reads — **not** a `VITE_` variable (those are inlined into the
browser).

In `.env.development.local`:

```bash
VITE_AI_PROVIDER=edge
```

Restart Vite after changing it. Leave it `mock` (or unset) for labelled sample
output with no model at all.

Only **one** `supabase functions serve` at a time — a second one takes over the
shared runtime container. Stop the current serve, then start the env you want.

#### Option A — your own API keys (Anthropic + OpenAI)

Bills **your** Anthropic/OpenAI accounts. Analysis is roughly $0.09–0.10 on
Claude; embeddings for prep chat/ingest use OpenAI.

1. `supabase/.env.local` (gitignored):
   ```bash
   ANTHROPIC_API_KEY=sk-ant-…
   OPENAI_API_KEY=sk-…
   # optional: ANTHROPIC_MODEL=claude-haiku-4-5-20251001
   ```
2. With the stack up:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```
3. `npm run dev` in another terminal. Each Analyze / Improve / Tailor / Ask press
   is an explicit spend.

#### Option B — local LLM via Ollama (no Anthropic bill)

Generation hits Ollama. Prep-source **embeddings still need OpenAI** unless you
skip ingest/chat retrieval.

1. [Install Ollama](https://ollama.com) and pull the strongest model that still
   feels fast on *your* machine for the whole product — resume analysis, tailoring,
   and prep chat, not only chat. What we used: `qwen2.5:7b` on a MacBook Pro with
   64GB (M1 Max), and the same tag on an M4 Max; resume parsing and the other AI
   surfaces stayed usable.
   ```bash
   ollama pull <your-model-tag>
   ```
2. Copy [`supabase/.env.ollama.example`](supabase/.env.ollama.example) to
   `supabase/.env.ollama`. Set `ANTHROPIC_MODEL` to the Ollama tag. Add
   `OPENAI_API_KEY` if you want prep chat / ingest.
3. Bridge (translates Anthropic `/v1/messages` → Ollama OpenAI `/v1/chat/completions`).
   Leave this terminal open:
   ```bash
   deno run --allow-net --allow-env supabase/functions/_stub/ollama-bridge.ts
   ```
4. Functions, pointed at the bridge (`host.docker.internal:8788`):
   ```bash
   supabase functions serve --env-file supabase/.env.ollama
   ```
5. `npm run dev`. The functions send `ANTHROPIC_MODEL`; the bridge uses that tag.
   Don't override it in the shell with a tag you have not pulled.

The functions container cannot see `localhost` on your Mac; the bridge must bind
`0.0.0.0:8788` on the host. If analysis dies with `ECONNREFUSED` on
`host.docker.internal:8788`, the bridge is not running.

More detail: [TECHNICAL.md §4](TECHNICAL.md#4-local-development) and the
shared-container gotcha in [§10](TECHNICAL.md#10-gotchas).

## Not built yet

Discover's job-feed queries, Practice, and drag-and-drop on the kanban board. Each of
these says so on screen instead of pretending. See [PROJECT.md](PROJECT.md) for what's
planned and in what order.

## Browser extension

A first version lives in [`extension/`](extension/README.md) — tailors your resume to
the job posting in the current tab and autofills the application, using this app's own
Supabase auth and Edge Functions. Real field-mapping so far covers Greenhouse plus a
label-matching fallback for other sites; LinkedIn, Workday, and Lever are not mapped
yet. See its own README for setup.
