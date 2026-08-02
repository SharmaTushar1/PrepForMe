# PrepFor.Me

A war room for high-intent job applications. PrepFor.Me tailors your resume
truthfully to each role, builds company-specific interview prep that compounds
with every recap you log, and keeps you in charge — nothing is ever auto-submitted.

Multi-user and persistent: data lives in Supabase Postgres behind row level
security, so every row belongs to exactly one account.

## Stack

- **React 18** + **TypeScript**, built with **Vite**.
- **Supabase** for Postgres, auth (magic link), and — later — Edge Functions.
- **TanStack Query** for all server state; **React Router** for navigation.
- No UI framework. Inline style strings are parsed into React style objects by the
  helper in [`src/css.ts`](src/css.ts), so oklch colors, gradients, and layout stay
  exactly as designed.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm run dev                  # http://localhost:5173
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in order — `supabase/migrations/0001_core.sql`, then
   `0002_prep.sql`, then `0003_grants.sql` — via the SQL editor or `supabase db push`.
   The third one is not optional: since May 2026 Supabase doesn't grant new tables
   to the Data API roles, so without it every query fails with 42501 even though
   the tables and their policies exist.
3. Copy the project URL from **Settings → API** and the `sb_publishable_…` key from
   **Settings → API Keys** into `.env.local`. Both are safe in the browser; row level
   security is what protects the data. (The publishable key replaced the legacy
   `anon` JWT, and drops into the same place.)
4. In **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:5173` and add `http://localhost:5173/**` to the redirect allow
   list. The login screen asks Supabase to send you back to `/app`; if that target
   isn't allow-listed, Supabase silently falls back to the Site URL instead.
5. Sign in at `/login`. The first sign-in creates your account, and a trigger seeds
   your `profiles` and `user_settings` rows.

The app boots without credentials so the marketing site still renders, and the
sign-in screen tells you what's missing.

Other scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

### Deploying

The build is static, so any static host works. Four things to get right:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host's
   environment settings **before** the build. Vite inlines them into the bundle, so
   adding them after a deploy changes nothing until you redeploy.
2. Serve every path from `index.html`. [`vercel.json`](vercel.json) does this; without
   it a hard refresh on `/app/applications` 404s, because the router is client-side.
3. Add the production domain to the Supabase Site URL and redirect allow list, keeping
   localhost so dev still works.
4. Configure custom SMTP before anyone else signs in. Supabase's built-in sender is
   rate-limited to a handful of messages an hour and is meant for testing.

## Architecture

| Path | Responsibility |
| --- | --- |
| [`src/lib/supabase.ts`](src/lib/supabase.ts) | The client, plus `unwrap` so a failed query throws and React Query owns the error state. |
| [`src/auth/SessionProvider.tsx`](src/auth/SessionProvider.tsx) | Session context. Clears the query cache on sign-in and sign-out so one account never sees another's rows. |
| [`src/data/`](src/data) | Every query and mutation, one file per domain, plus `derived.ts` (presentation values) and `metrics.ts` (the funnel and the needs-attention queue). |
| [`src/lib/ai/`](src/lib/ai) | The `AiProvider` interface and the local provider behind it. |
| [`src/store.tsx`](src/store.tsx) | UI-only state: which overlay is open, where the tour is, board vs. table. |
| [`src/routes.ts`](src/routes.ts) | Every route in one place. |
| [`src/components/`](src/components) | One component per screen or overlay. |
| [`supabase/migrations/`](supabase/migrations) | The schema, including RLS policies, the stage-history trigger, and the Data API grants. |

### Data model, briefly

- `profiles`, `experiences`, `experience_bullets`, `skills` — the spine. Everything
  the app generates comes from here; a disabled bullet is withheld from tailoring.
- `applications` — one row per role, with the pasted job description.
- `application_stage_events` — appended by a trigger on every stage change. Response
  rate and interview rate are computed from this history, not from the current stage,
  so a role that was screened and then rejected still counts as a response.
- `recaps` — what was actually asked. The highest-value data in the product.
- `prep_sources`, `prep_messages`, `referral_contacts`, `tailorings` — the prep and
  referral layers.

### The AI seam

Every generated surface reads from `ai` in [`src/lib/ai`](src/lib/ai) rather than
calling a model directly. The current provider is local: it reasons only over your
own bullets, your pasted job description, and your own recaps, so nothing it
produces is a claim you can't defend. Swapping in a real model behind a Supabase
Edge Function is a provider change, not a UI change.

## Not built yet

Resume upload and parsing, real LLM calls, Discover's job-feed queries, the browser
extension, Practice, and drag-and-drop on the kanban board. Each of these says so on
screen instead of pretending.
