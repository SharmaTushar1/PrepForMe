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

## Not built yet

Resume upload and parsing, real LLM calls, Discover's job-feed queries, the browser
extension, Practice, and drag-and-drop on the kanban board. Each of these says so on
screen instead of pretending. See [PROJECT.md](PROJECT.md) for what's planned and in
what order.
