# PrepFor.Me

A war room for high-intent job applications. PrepFor.Me tailors your resume
truthfully to each role, builds company-specific interview prep that compounds
with every recap you log, and keeps you in charge — nothing is ever auto-submitted.

**Live:** https://prep-for-me.vercel.app/ — pre-v1, a working CRUD skeleton.

## Documentation

| Doc | What's in it |
| --- | --- |
| [PROJECT.md](PROJECT.md) | **The source of truth.** What the product is, the moat, scope and non-scope, decisions, current state, open questions, version history. |
| [TECHNICAL.md](TECHNICAL.md) | Stack, hosting, environment, code layout, data model, migrations, deploy, and the gotchas that have already cost time. |
| [AGENTS.md](AGENTS.md) | Conventions and invariants for anyone — human or agent — changing this repo. |

## Stack

React 18 + TypeScript, built with Vite. Supabase for Postgres, magic-link auth, and
later Edge Functions. TanStack Query for server state, React Router for navigation. No
UI framework: inline style strings are parsed into React style objects by
[`src/css.ts`](src/css.ts), so oklch colors and gradients stay exactly as designed.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm run dev                  # http://localhost:5173
```

The app boots without credentials — the landing page renders and the sign-in screen
tells you what's missing — so a blank `.env.local` never crashes anything.

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
   or magic links will send you somewhere that isn't your dev server.
5. Sign in at `/login`. The first sign-in creates your account, and a trigger seeds your
   `profiles` and `user_settings` rows.

Scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

### Resume analysis locally (Anthropic vs free stub)

`supabase start` brings up Postgres, Auth, and Storage — it does **not** put your
`ANTHROPIC_API_KEY` into the Edge Function runtime. You need a separate
`supabase functions serve` process, and the key must live in a file that process reads
(`supabase/.env.local` or `supabase/.env.stub`), **not** in `.env.development.local`
or any `VITE_` variable (those are for the browser / Vite only).

Also set `VITE_AI_PROVIDER=edge` in `.env.development.local` so `npm run dev` calls the
function instead of the labelled sample provider. Restart Vite after changing it.

**Real Anthropic (bills the key — ~$0.09–0.10 per analysis):**

1. Put the key in `supabase/.env.local`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-…
   ```
2. With the local stack already running (`supabase start`), serve the functions:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```
3. Leave that terminal open. In another terminal: `npm run dev`, then press
   **Analyze this resume** (or **Improve my resume**). Each press is an explicit spend.

**Free stub (no Anthropic bill):**

1. Start the local stub that pretends to be Anthropic:
   ```bash
   deno run --allow-net --allow-env supabase/functions/_stub/anthropic.ts
   ```
2. In another terminal, serve the functions against the stub env (points
   `ANTHROPIC_BASE_URL` at `host.docker.internal:8787`):
   ```bash
   supabase functions serve --env-file supabase/.env.stub
   ```
3. Use the app the same way. Responses are fake; nothing is charged at Anthropic.

To switch between real and free: stop the current `functions serve`, start the other
`--env-file` (and the stub process if you're going free). Only one `functions serve`
should run at a time — a second one takes over the shared runtime container. Set
`VITE_AI_PROVIDER` back to `mock` (or delete the line) if you want the in-app sample
provider with no Edge Function at all.

More detail: [TECHNICAL.md §4](TECHNICAL.md#4-local-development) and the shared-container
gotcha in [§10](TECHNICAL.md#10-gotchas).

## Not built yet

Resume upload and parsing, real LLM calls, Discover's job-feed queries, the browser
extension, Practice, and drag-and-drop on the kanban board. Each of these says so on
screen instead of pretending. See [PROJECT.md](PROJECT.md) for what's planned and in
what order.
