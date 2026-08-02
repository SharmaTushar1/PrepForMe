# PrepFor.Me — Technical Documentation

*How the app is built, where it runs, and the things that will bite you. Companion to
[PROJECT.md](PROJECT.md), which holds strategy, scope, and decisions. Update this file
whenever the stack, schema, hosting, or environment changes.*

**Last updated:** 2 Aug 2026

---

## 1. At a glance

| Concern | Choice |
| --- | --- |
| UI | React 18.3 + TypeScript 5.6, strict mode |
| Build | Vite 5.4 (`@vitejs/plugin-react`), single static bundle |
| Routing | React Router 7 (`BrowserRouter`) |
| Server state | TanStack Query 5 |
| Backend | Supabase — Postgres, PostgREST Data API, GoTrue auth |
| Auth | Magic link (email OTP), no passwords |
| Styling | No UI framework. Inline style strings parsed by [`src/css.ts`](src/css.ts), plus a small [`src/index.css`](src/index.css) for form-control resets |
| Hosting | Vercel (static) + Supabase (managed Postgres) |
| AI | Not live. An `AiProvider` interface with a local implementation — see §8 |

There is no test suite, no linter config, and no CI yet. `npm run build` runs
`tsc --noEmit && vite build`, so type errors are the only automated gate.

## 2. Hosting topology

```
Browser
  ├── static assets ──────────► Vercel CDN (prep-for-me.vercel.app)
  └── data + auth ────────────► Supabase project hwuqytcrkzetqfvtnmqs
                                 ├── PostgREST  /rest/v1   (RLS-guarded)
                                 └── GoTrue     /auth/v1   (magic link)
```

- **Vercel** builds from GitHub `main` on push. Framework preset: Vite. Output: `dist/`.
  [`vercel.json`](vercel.json) rewrites unmatched paths to `/index.html`; the filesystem
  is checked first, so hashed assets still serve normally.
- **Supabase** project ref `hwuqytcrkzetqfvtnmqs`, region Mumbai (`ap-south-1`, permanent —
  region cannot be changed after creation). Data API on, automatic RLS on, auto-expose
  new tables **off** (see §7).
- **No server of our own.** The browser talks to Supabase directly, and row level
  security is the entire authorization boundary. When LLM calls arrive they get a
  Supabase Edge Function, because the provider key must never reach the client.

## 3. Environment variables

| Variable | Value | Set where |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | hosted `https://hwuqytcrkzetqfvtnmqs.supabase.co`, local `http://127.0.0.1:54321` | Vercel project settings for deploys, `.env.development.local` for `npm run dev`, `.env.local` as the fallback for both |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`, different per environment | same |

Both are safe in the browser and are compiled into the bundle; RLS is what protects
data. Three consequences worth internalising:

1. **They are build-time, not runtime.** Vite inlines `VITE_*` at build. Adding or
   changing a variable in Vercel does nothing until a new build runs — and a
   *redeploy of an existing build* reuses the old inlined values. Trigger a rebuild.
2. **Anything not prefixed `VITE_` is invisible to the client**, which is the mechanism
   that will keep the LLM key server-side.
3. **`.env.local` is gitignored** via the `*.local` pattern, along with any
   `.env.development.local` you add for a local Supabase stack.

Types for these live in [`src/vite-env.d.ts`](src/vite-env.d.ts); add new variables there
or TypeScript won't know them.

## 4. Local development

```bash
npm install
cp .env.example .env.local   # fill in URL + publishable key
npm run dev                  # http://localhost:5173
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server, port 5173, `host: true` so it's reachable on the LAN |
| `npm run build` | `tsc --noEmit` then production build to `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run typecheck` | `tsc --noEmit` alone |

The app boots without credentials — the landing page renders and the sign-in screen
explains what's missing — so a missing `.env.local` never crashes the bundle. That
graceful path lives in [`src/lib/supabase.ts`](src/lib/supabase.ts) as
`isSupabaseConfigured`.

### Pointing dev at a separate database

`npm run dev` runs in Vite's development mode, `vite build` in production mode, and env
files load in order `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`, later
winning. So putting local credentials in **`.env.development.local`** sends `npm run dev`
to a local stack while Vercel keeps using its own variables.

**Status: set up and in use.** `npm run dev` talks to the local stack; the hosted project
is only used by builds. Credentials live in `.env.development.local` (gitignored) — run
`supabase status` to re-read them, and re-copy them if you ever recreate the stack.

```bash
supabase start   # boots the stack, applies every migration in supabase/migrations/
supabase stop    # frees the containers; add --no-backup to discard local data
supabase status  # URLs and keys
supabase db reset  # drop, re-run every migration from scratch, apply seed.sql if present
```

| Local service | Port |
| --- | --- |
| API (PostgREST + GoTrue) | 54321 |
| Postgres | 54322 |
| Studio | 54323 |
| Inbox (captures every outgoing email) | 54324 |

`supabase init` writes `site_url = "http://127.0.0.1:3000"` and an `https` redirect URL by
default, neither of which matches the dev server; both are now pointed at
`http://localhost:5173`. **Visit the app on `localhost`, not `127.0.0.1`** — they're
different origins, and only the former is allow-listed.

Sign-in emails never leave the machine: open the inbox on port 54324 and click the link
there. No rate limit, which is the main day-to-day reason to bother with any of this.

Note that `npm run preview` runs in *production* mode, so it reads `.env.local` and will
talk to the real hosted database.

## 5. Code layout

| Path | Responsibility |
| --- | --- |
| [`src/main.tsx`](src/main.tsx) | Provider stack: `QueryClientProvider` → `BrowserRouter` → `SessionProvider` → `AppProvider` |
| [`src/App.tsx`](src/App.tsx) | Route table and the auth guard around the app shell |
| [`src/routes.ts`](src/routes.ts) | Every route path in one place, including the parameterised builders |
| [`src/lib/supabase.ts`](src/lib/supabase.ts) | The client, `isSupabaseConfigured`, and `unwrap` — which throws on a PostgREST error so React Query owns error state |
| [`src/auth/SessionProvider.tsx`](src/auth/SessionProvider.tsx) | Session context and `signOut`. Clears the query cache on both sign-in and sign-out so one account never sees another's cached rows |
| [`src/data/`](src/data) | Every query and mutation, one file per domain, plus `derived.ts` (presentation values), `metrics.ts` (funnel + needs-attention queue), and `queryKeys.ts` (all cache keys, each namespaced by user id) |
| [`src/lib/ai/`](src/lib/ai) | The `AiProvider` interface, the local implementation, and keyword extraction |
| [`src/lib/`](src/lib) | `db.types.ts` (row shapes), `depth.ts` (prep-depth and readiness maths), `format.ts` (dates and percentages) |
| [`src/store.tsx`](src/store.tsx) | UI-only state: which overlay is open, tour position, board vs. table |
| [`src/data.ts`](src/data.ts) | Static constants — stage lists, tour steps. Not to be confused with `src/data/` |
| [`src/components/`](src/components) | One component per screen or overlay; [`detail/`](src/components/detail) holds the four application-detail tabs |
| [`src/components/ui.tsx`](src/components/ui.tsx) | Shared primitives, including the inputs that commit on blur |
| [`supabase/migrations/`](supabase/migrations) | Schema, RLS policies, triggers, and Data API grants |

### The state-ownership rule

Three homes, no overlap. Breaking this is how the prototype's in-memory store became
unmaintainable in the first place.

- **Server data → React Query**, always via a hook in `src/data/`. Components never call
  `supabase` directly.
- **Navigation state → the URL.** Which application, which tab, whether the recap form is
  open. This is what makes a refresh land where you were.
- **Ephemeral UI state → `store.tsx`.** Nothing here needs to survive a reload.

## 6. Data model

Fourteen tables, all in `public`, all owned by exactly one user. Child tables carry a
denormalised `user_id` defaulting to `auth.uid()`, so every RLS policy is a single
index-backed comparison rather than a subquery per row. Every table has the same policy
shape:

```sql
create policy "own X" on public.X
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**The spine** — `profiles` (PK is `auth.users.id` itself), `experiences`,
`experience_bullets`, `skills`. Everything the app generates derives from here. A bullet
with `enabled = false` stays in the profile but is withheld from tailoring.

**The tracker** — `applications`, one row per role, holding the pasted job description
and `next_action` / `next_action_at`. Stage is a checked text column:
`Saved → Applied → Screen → Technical → Onsite → Offer`, plus `Rejected` and `Withdrawn`.

**The history** — `application_stage_events`, append-only, written by the
`record_stage_event` trigger on insert and on any stage change. Response rate and
interview rate are computed from *this*, not from the current stage, so a role that was
screened and then rejected still counts as a response. The client only reads it; it has
`select` and nothing else.

**The prep layer** — `recaps` (what was actually asked — the highest-value rows in the
product), `prep_sources`, `prep_messages` (with a `citations` jsonb column so provenance
is always displayable).

**Created but not yet wired** — `referral_contacts`, `tailorings`, `tailoring_changes`,
`ats_keywords`. The tables and policies exist; no code reads or writes them yet, so
those surfaces still show computed or placeholder values.

### Triggers

| Trigger | Effect |
| --- | --- |
| `on_auth_user_created` on `auth.users` | Seeds a `profiles` and a `user_settings` row for every new account, so the client never special-cases their absence. `security definer`, which is why it works despite the grant model in §7 |
| `record_stage_event` on `applications` | Appends to `application_stage_events` on insert and stage change |
| `stamp_applied_at` on `applications` | Stamps `applied_at` the first time a role leaves `Saved` |
| `set_updated_at` on several tables | Maintains `updated_at` |

## 7. Migrations and the grants rule

Files in [`supabase/migrations/`](supabase/migrations), applied in filename order:

| File | Contents |
| --- | --- |
| `0001_core.sql` | Profile spine, tracker, stage history, recaps, RLS, triggers |
| `0002_prep.sql` | Prep, referral, and tailoring tables |
| `0003_grants.sql` | Data API grants to the `authenticated` role |

All three are applied to the hosted project and verified working. They were applied by
pasting into the Supabase SQL Editor, and the CLI is not linked, so
`supabase_migrations.schema_migrations` is empty; if you later run `supabase db push` it
will try to replay `0001` and fail on existing objects. Run
`supabase migration repair --status applied 0001 0002 0003` first.

**Treat an applied migration as immutable.** Editing `0001` changes nothing in a database
that already ran it. Every change is a new numbered file — which is exactly why the
grants fix is `0003` rather than folded into `0001`.

### Every new table needs an explicit grant

Since 2026-05-30, Supabase no longer grants new tables to the Data API roles, and this
project has "automatically expose new tables" off. A table can exist, have RLS enabled,
and have correct policies, and still fail every request with:

```json
{"code":"42501","message":"permission denied for table X",
 "hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.X TO anon;"}
```

Grants are checked *before* RLS, so no policy ever executes and the error says nothing
about policies. **Any migration that creates a table must grant it**, following the
pattern in `0003`:

```sql
grant select, insert, update, delete on public.new_table to authenticated;
```

Only `authenticated` is granted. Every table is user-owned and nothing is read before
sign-in, so `anon` deliberately has no access at all. A future Edge Function using the
service key will need its own `service_role` grant. No sequence grants are needed
because every primary key is a `uuid` default, not a serial.

## 8. The AI seam

Nothing calls a model yet. Every generated surface reads from `ai` in
[`src/lib/ai/`](src/lib/ai), behind the `AiProvider` interface, and the current
implementation is local: it reasons only over the user's own bullets, their pasted job
description, and their own recaps. Two properties fall out of that, both deliberate —
nothing it produces is a claim the user can't defend, and swapping in a real model is a
provider change rather than a UI change.

When a real provider lands it goes behind a **Supabase Edge Function**, never a direct
call from the browser, because the API key cannot ship in the bundle. Before the first
real call: set a hard spend cap and a billing alert.

## 9. Deploying

Push to `main`; Vercel builds and publishes. The build is fast because there's genuinely
little to do — 172 modules, one bundle, no SSR, no functions, no image optimisation, and
type checking is the slowest step.

Current output is a single **629 kB (172 kB gzipped)** chunk. Vite warns about the size.
No code splitting yet; the obvious first cut is lazy-loading the app shell away from the
landing page.

Four things a new environment needs:

1. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set **before** the build.
2. Unmatched paths rewritten to `index.html` (`vercel.json` handles Vercel).
3. The domain added to Supabase **Authentication → URL Configuration**, both as Site URL
   or in the redirect allow list.
4. Custom SMTP before anyone else signs in — see §10.

## 10. Gotchas

Things that have already cost time, or will.

- **42501 on every query** — missing grants, not RLS. See §7.
- **Magic link redirects to the wrong place.** `Login.tsx` requests
  `emailRedirectTo: ${origin}/app`. If that URL isn't in the Supabase redirect allow
  list, Supabase *silently* falls back to the Site URL, which defaults to
  `localhost:3000` while dev runs on 5173. Symptom: the link "works" but lands nowhere.
- **Env changes need a rebuild**, not a redeploy. See §3.
- **Publishable key, not anon key.** `sb_publishable_…` replaced the legacy `anon` JWT
  and goes in the same slot. Supabase docs and older tutorials still say "anon key".
- **Built-in email is rate-limited** to a handful of messages an hour and is
  test-only. It will throttle you while iterating on sign-in long before it affects
  real users. A local Supabase stack (§4) sidesteps it entirely.
- **A hard refresh on a nested route 404s** without the SPA rewrite. Vercel's Vite preset
  does not reliably add one; `vercel.json` is explicit for that reason.
- **`src/data.ts` and `src/data/` are different things.** Constants versus hooks.

## 11. Not wired yet

Resume upload and parsing, real LLM calls, Discover's job-feed queries, the browser
extension, Practice, drag-and-drop on the kanban board, and the four tables listed in
§6. Each of these says so on screen rather than pretending. The scoped-retrieval
infrastructure the product depends on — pgvector, embeddings, the
`(company, role, level, interview-type)` content key with provenance and corroboration
count — does not exist in the schema yet; see §13 of [PROJECT.md](PROJECT.md).
