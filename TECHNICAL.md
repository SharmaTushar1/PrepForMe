# PrepFor.Me — Technical Documentation

*How the app is built, where it runs, and the things that will bite you. Companion to
[PROJECT.md](PROJECT.md), which holds strategy, scope, and decisions. Update this file
whenever the stack, schema, hosting, or environment changes.*

**Last updated:** 6 Aug 2026

---

## 1. At a glance

| Concern | Choice |
| --- | --- |
| UI | React 18.3 + TypeScript 5.6, strict mode |
| Build | Vite 5.4 (`@vitejs/plugin-react`), SPA + Vercel `/api` Node functions |
| Routing | React Router 7 (`BrowserRouter`) |
| Server state | TanStack Query 5 |
| Backend | Supabase — Postgres, PostgREST Data API, GoTrue auth, Storage, Edge Functions |
| Auth | Magic link + Google OAuth (no passwords) |
| Files | Private Storage buckets `resumes` and `prep-sources` — see §6 |
| Styling | No UI framework. Inline style strings parsed by [`src/css.ts`](src/css.ts), plus a small [`src/index.css`](src/index.css) for form-control resets |
| Resume PDF | HTML templates (Classic/Compact) → Chromium on Vercel (`api/render-resume-pdf.ts`); local Vite middleware for `npm run dev` |
| Hosting | Vercel (SPA + `/api` Node functions) + Supabase (Postgres, Storage, Deno Edge Functions) |
| AI | Edge Functions for resume analysis/rewrite/tailor and company prep. Embeddings via OpenAI. Default client provider is mock unless `VITE_AI_PROVIDER=edge` — see §4 and §8 |

There is no test suite, no CI, and no linter — no `lint` script, no ESLint
dependency, no config. `npm run build` runs `tsc --noEmit && vite build`, so type
errors are the only automated gate. The Edge Function sits outside even that:
`tsconfig.json` includes `src` and `vite.config.ts` only, so nothing in
`supabase/functions/` is checked by `npm run build`. Use `deno check` on it, or find
out at deploy.

## 2. Hosting topology

```
Browser
  ├── static assets ──────────► Vercel CDN (prep-for-me.vercel.app)
  └── data + auth + files ────► Supabase project hwuqytcrkzetqfvtnmqs
                                 ├── PostgREST  /rest/v1        (RLS-guarded)
                                 ├── GoTrue     /auth/v1        (magic link)
                                 ├── Storage    /storage/v1     (private bucket)
                                 └── Functions  /functions/v1   (Deno)
                                       └── analyze-resume ──────► api.anthropic.com
```

- **Vercel** builds from GitHub `main` on push. Framework preset: Vite. Output: `dist/`.
  [`vercel.json`](vercel.json) rewrites unmatched paths to `/index.html`; the filesystem
  is checked first, so hashed assets still serve normally.
- **Supabase** project ref `hwuqytcrkzetqfvtnmqs`, region Mumbai (`ap-south-1`, permanent —
  region cannot be changed after creation). Data API on, automatic RLS on, auto-expose
  new tables **off** (see §7).
- **No server of our own.** The browser talks to Supabase directly, and row level
  security is the entire authorization boundary. The one exception is
  `analyze-resume` (§8), which exists because the Anthropic key must never reach the
  client — and even there the function reads the PDF under the caller's own JWT, so
  RLS still decides who sees what.

## 3. Environment variables

### Client — compiled into the bundle

| Variable | Value | Set where |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | hosted `https://hwuqytcrkzetqfvtnmqs.supabase.co`, local `http://127.0.0.1:54321` | Vercel project settings for deploys, `.env.development.local` for `npm run dev`, `.env.local` as the fallback for both |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`, different per environment | same |
| `VITE_AI_PROVIDER` | `mock` (default) or `edge` | same — and `.env.development.local` sets `edge`, so `npm run dev` reaches a model. Only `edge` does; see §8 |

All three are safe in the browser; RLS is what protects data. Three consequences
worth internalising:

1. **They are build-time, not runtime.** Vite inlines `VITE_*` at build. Adding or
   changing a variable in Vercel does nothing until a new build runs — and a
   *redeploy of an existing build* reuses the old inlined values. Trigger a rebuild.
   This applies to `VITE_AI_PROVIDER` too: turning the real provider on or off is a
   deploy, not a toggle.
2. **Anything not prefixed `VITE_` is invisible to the client**, which is the mechanism
   that keeps the Anthropic key server-side.
3. **Every `.env` file is gitignored**, at any depth — `.env`, `.env.*`, and the older
   `*.local` pattern, with `.env.example` explicitly un-ignored. Bare `.env` and
   `supabase/functions/.env` were both committable until 4 Aug, which mattered because
   the Anthropic key lives one directory away in `supabase/.env.local`. Verify with
   `git check-ignore -v <path>` rather than by eye if you add another one.

Types for the client variables live in [`src/vite-env.d.ts`](src/vite-env.d.ts); add new
ones there or TypeScript won't know them.

### Server — the Edge Function only

| Variable | Value | Set where |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | `supabase/.env.local` locally, Supabase project secrets when deployed |
| `ANTHROPIC_MODEL` | optional override; defaults to `claude-sonnet-5` | same |
| `ANTHROPIC_EFFORT` | optional; `low`\|`medium`\|`high`\|`xhigh`\|`max`, defaults to `medium`. An unrecognised value is logged and ignored rather than passed through to a 400. Dropped entirely for models that reject it — see §10 | same |
| `ANTHROPIC_EXTRACT_MODEL`, `ANTHROPIC_CHAT_MODEL` | optional; both default to `claude-haiku-4-5-20251001`. Claim extraction, relevance checks, PDF text extraction and prep chat, none of which need Sonnet | same |
| `ANTHROPIC_BASE_URL` | optional; defaults to `https://api.anthropic.com`. Points the analyzer at [the stub](#the-analyze-resume-edge-function) or an egress proxy | same |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | injected by the functions runtime | nowhere — they arrive on their own |

**Neither Anthropic variable may ever gain a `VITE_` prefix.** That is the whole
reason the function exists. Which Supabase keys the runtime actually injects is a
trap in its own right — see §10.

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

### Running the Edge Functions locally

`supabase start` does not serve functions. They need their own process, and their own
env file — the runtime does not read the root `.env.local`. Naming no function serves
all of them, which is what you want now that there are two:

```bash
supabase functions serve --env-file supabase/.env.local
```

That file holds `ANTHROPIC_API_KEY`. It is gitignored, and the key must never be
copied anywhere with a `VITE_` prefix.

To drive either function without spending anything, serve with `supabase/.env.stub`
instead and run [`_stub/anthropic.ts`](supabase/functions/_stub/anthropic.ts) alongside
it — but read the shared-container gotcha in §10 before you switch back.

**Status: switched on, and that is a live spending risk.**
`.env.development.local` sets `VITE_AI_PROVIDER=edge`, so with the functions served,
pressing "Analyze resume" or "Improve my resume" under `npm run dev` reaches Anthropic
and bills a real key on an account with no cap on it (§8). Nothing spends on its own —
storing a file calls nothing, and each model call is always its own press — but the old
comfort that a dev machine cannot spend money by accident no longer applies here. Set
the variable back to `mock`, or delete the line, to go back to the labelled sample.

## 5. Code layout

| Path | Responsibility |
| --- | --- |
| [`src/main.tsx`](src/main.tsx) | Provider stack: `QueryClientProvider` → `BrowserRouter` → `SessionProvider` → `AppProvider` |
| [`src/App.tsx`](src/App.tsx) | Route table and the auth guard around the app shell |
| [`src/routes.ts`](src/routes.ts) | Every route path in one place, including the parameterised builders |
| [`src/lib/supabase.ts`](src/lib/supabase.ts) | The client, `isSupabaseConfigured`, and `unwrap` — which throws on a PostgREST error so React Query owns error state |
| [`src/auth/SessionProvider.tsx`](src/auth/SessionProvider.tsx) | Session context and `signOut`. Clears the query cache on both sign-in and sign-out so one account never sees another's cached rows |
| [`src/data/`](src/data) | Every query and mutation, one file per domain, plus `derived.ts` (presentation values), `metrics.ts` (funnel + needs-attention queue), and `queryKeys.ts` (all cache keys, each namespaced by user id) |
| [`src/lib/ai/`](src/lib/ai) | The `AiProvider` interface, provider selection, the local implementation, the Edge Function client, and keyword extraction |
| [`src/lib/`](src/lib) | `db.types.ts` (row shapes), `depth.ts` (prep-depth and readiness maths), `format.ts` (dates, percentages, file sizes) |
| [`src/lib/resume/`](src/lib/resume) | The rebuild: `document.ts` (parse → ordered blocks), `docx.ts` + `zip.ts` (WordprocessingML in a hand-written ZIP), `pdf.ts` + `pdfFont.ts` (single-column PDF with Helvetica metrics), and `edits.ts` (accepted rewrites → parse, by verbatim match). No dependencies, no server, no model — see §11 |
| [`src/store.tsx`](src/store.tsx) | UI-only state: which overlay is open, tour position, board vs. table |
| [`src/data.ts`](src/data.ts) | Static constants — stage lists, tour steps. Not to be confused with `src/data/` |
| [`src/components/`](src/components) | One component per screen or overlay; [`detail/`](src/components/detail) holds the four application-detail tabs and [`resume/`](src/components/resume) the upload card, ATS report, rewrite card, rebuild offer and parse review |
| [`src/components/ui.tsx`](src/components/ui.tsx) | Shared primitives, including the inputs that commit on blur |
| [`supabase/migrations/`](supabase/migrations) | Schema, RLS policies, triggers, storage policies, and Data API grants |
| [`supabase/functions/`](supabase/functions) | Deno. One function per directory, plus `_shared/` for the modules they have in common |

### The state-ownership rule

Three homes, no overlap. Breaking this is how the prototype's in-memory store became
unmaintainable in the first place.

- **Server data → React Query**, always via a hook in `src/data/`. Components never call
  `supabase` directly.
- **Navigation state → the URL.** Which application, which tab, whether the recap form is
  open. This is what makes a refresh land where you were.
- **Ephemeral UI state → `store.tsx`.** Nothing here needs to survive a reload.

## 6. Data model

Eighteen tables, all in `public`, all owned by exactly one user. Child tables carry a
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

`prep_sources.scope` is `company` or `role`, and it means more than a label: a
company-scope source stores its claims with `role`/`level` null, which
`match_prep_chunks` matches against every role at that company. So the source list a role
shows is its own rows **plus** every company-scope row from a sibling role — assembled in
`usePrepSources`, which takes the company name for that reason and filters client-side
because the match strips legal suffixes and cannot be expressed as a PostgREST filter.
`useApplications` applies the same rule to `sourceCount` in one pass over the rows it
already has. Inherited rows carry another role's `application_id`, which is what the UI
keys "company-wide" and the absent delete button off. See §10 for why a count that
disagrees with retrieval is a bug in the count.

**The base resume** — `resumes`, one row per uploaded PDF, holding the storage path,
the file's own metadata, a `page_count` the analyzer fills in, and a `status` of
`uploaded | analyzing | analyzed | failed` with the user-facing `error` beside it.
`uploaded` is where the client leaves it; every later value is written by the Edge
Function and by nothing else, which is load-bearing rather than tidy — see §10.
`resume_reports` holds what a model made of it: `overall_score`, `summary`, token
counts, and two jsonb columns — `report` (the ATS review) and `parsed` (the structured
resume). Both are jsonb because their shape is owned by
[`src/lib/ai/types.ts`](src/lib/ai/types.ts) and would otherwise need a migration every
time a category is reworded. `profiles.base_resume_id` points at the canonical upload,
`on delete set null` so removing a resume never takes the profile with it.

`resume_reports` has no unique constraint on `resume_id`, so a forced re-analysis
appends a row rather than replacing one. Readers take the newest by `created_at`,
which is correct; if one report per resume is ever wanted, that is a new migration and
not an edit to `0004`.

**The rewrites** — `resume_improvements`, one row per rewrite pass, carrying the same
`running | done | failed` status, the model, the token counts and the in-flight lock.
`resume_edits` holds the suggestions themselves, one row per rewritten line, each
`suggested | accepted | dismissed`. Two columns there earn their place: `original` is
stored **verbatim**, because that string is how a rewrite finds its line again at
rebuild time and a normalised copy would match nothing; and `flag` holds a warning for
a rewrite that introduced a figure the original never stated, which is a suggestion the
UI shows but holds back from "accept all".

Both hang off `report_id` with `on delete cascade`, so re-analysing a resume disposes
of rewrites written against findings that no longer exist. A pass that produces
suggestions deletes the previous pass's `resume_edits` rows — a fresh set replaces the
old one rather than stacking beside it, and it happens *after* the model answers, so a
failed retry costs the user nothing. A pass that produces nothing deletes nothing. The
`resume_improvements` rows are never deleted: they are the spend record.

**Created but not yet wired** — `referral_contacts`, `tailorings`, `tailoring_changes`,
`ats_keywords`. The tables and policies exist; no code reads or writes them yet, so
those surfaces still show computed or placeholder values.

### Storage

One bucket, `resumes`: private, capped at 10 MB, `application/pdf` only. Both limits
are on the bucket itself, so a bad file is refused by Storage even if a caller skips
the checks in [`src/data/resumes.ts`](src/data/resumes.ts).

Objects are named `{user_id}/{resume_id}.pdf`, and **that path convention is the entire
authorization story**. `storage.objects` is one table shared by every bucket, so it
can't carry a `user_id` column of its own; all four policies instead compare
`(storage.foldername(name))[1]` against `auth.uid()::text`. A file written outside
its own folder would be unreachable, and one written inside someone else's would be
theirs. The id is minted client-side and used for both the object and the row, so
there is no window where one exists under a name the other can't find.

The browser never gets a durable link: "Open the PDF" is a signed URL, issued for ten
minutes and re-signed a minute before it lapses. The Edge Function doesn't use one — it
downloads the object directly, under the caller's own JWT, so the same four policies
apply to it as to the browser.

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
| `0004_resumes.sql` | `resumes` bucket and its four storage policies, `resumes` and `resume_reports`, `profiles.base_resume_id`, RLS, grants |
| `0005_resume_edits.sql` | `resume_improvements` and `resume_edits`, RLS, grants, `updated_at` triggers |
| `0006_ai_quota.sql` | `ai_usage` attempts ledger, and narrowed `user_settings` grants so `plan` is not self-service |
| `0007_prep_corpus.sql` | `vector` extension, `applications.company_domain`, `prep_chunks` + HNSW + `match_prep_chunks`, `prep-sources` bucket, prep_sources scope/input columns, `relevance_check` on `ai_usage` |
| `0008_catalog.sql` | `catalog_levels` / `companies` / `roles` / `role_aliases` / `requests`; `applications` FKs + specialty + employment_type |
| `0009_resume_templates.sql` | `profiles.default_template_id`, `applications.template_id` + `tailored_resume` jsonb (fields, later also session envelope — no schema change) |
| `0010_ai_usage_tailor.sql` | `tailor` added to the `ai_usage` feature check, which `0009` should have widened |
| `0011_profile_sections.sql` | `profiles` phone/location/links/summary; `education`/`projects`/`certifications` (+ line children), RLS, grants |

`0001`–`0011` are applied both locally and to the hosted project (history repaired 5 Aug so `db push` could land `0007`).

**The hosted ledger is not to be trusted, and this has already bitten.** Several migrations
were applied there by hand — SQL Editor and the Management API — so
`supabase_migrations.schema_migrations` does not reflect what the database contains. A
`supabase db push` will try to replay from `0001` and fail on existing objects. Repair the
history first (`supabase migration repair --status applied 0001 0002 0003 0004 0005`) or keep
applying by hand.

The local ledger had the same drift and was repaired on 2026-08-05: `0005` existed as tables
but not as a row, so `migration up` tried to recreate `resume_improvements` and failed with
42P07. `supabase migration repair --status applied 0005 --local` fixed it, and `0006` then
applied normally. If a local `migration up` fails on "already exists", this is why.

Note that the corpus migration is **`0007`** and is now written — claim-based RAG, not verbatim chunks. See [PHASE3_SPEC.md](PHASE3_SPEC.md) for the original sketch; product decisions on 5 Aug supersede verbatim storage and deferred promotion.

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

`anon` is deliberately granted nothing at all: every table is user-owned and nothing is
read before sign-in. No sequence grants are needed either, because every primary key is
a `uuid` default rather than a serial.

`0004` is the first migration to also grant `service_role`, on `resumes`,
`resume_reports`, and `update` on `profiles`. The `analyze-resume` function runs under
the caller's own JWT and so does not need it today — the grant is there because the
function writes a terminal `failed` status on paths where the caller's request may
already have gone away, and reaching for the service key at that point should not be
the moment anyone discovers a missing grant.

## 8. The AI seam

Every generated surface reads from `ai` in [`src/lib/ai/`](src/lib/ai), behind the
`AiProvider` interface. There are two implementations and
[`index.ts`](src/lib/ai/index.ts) picks between them on one variable:

```ts
export const ai: AiProvider =
  import.meta.env.VITE_AI_PROVIDER === "edge" ? edgeAiProvider : mockAiProvider;
```

**The default is the mock, and the default is the point.** `edge` is the only value
that reaches a model and spends money, so an unset, misspelled or stale variable costs
nothing rather than quietly billing a dev machine.

- **`mock.ts`** reasons only over the user's own bullets, their pasted job description
  and their own recaps, so nothing it produces is a claim the user can't defend. For
  resume analysis it can't do that — there is no PDF reader in the bundle — so it
  returns a fixture flagged `sample: true`. Every screen keys its
  "Sample output — local mode, no model was called" banner off that flag rather than
  off which provider is wired up, and a sample is never written to `resume_reports`.
- **`edge.ts`** implements `analyzeResume`, `improveResume`, and `answerPrepQuestion`
  against Edge Functions. Everything else still delegates to the mock, method by method
  rather than by spreading it — so adding a capability to `AiProvider` fails to compile
  until someone decides which side of the seam it belongs on.

### The `prep-chat` Edge Function

Grounded company-prep answers over `prep_chunks`. Each turn:

1. Embeds the current question (`text-embedding-3-small`).
2. Calls `match_prep_chunks` (similarity ≥ 0.25; soft retry at 0 if empty).
3. Sends up to **8 prior turns** of chat history plus a final user message that includes
   the retrieved claims for *this* turn only.
4. Returns structured JSON `{ answer, suggestedClaims }` — Save-to-prep suggestions come
   from the exchange (including “save it, it was in an interview”), not a dump of
   retrieved rows. Citations are deduped by `sourceUrl` / label and carry `sourceUrl` for
   clickable pills in the UI.

Company-specific facts must come from claims; labeled general coaching is allowed when
claims don't cover the question. Never invent company-specific loop details.

One press, one Claude call, both halves of the answer: the ATS report and the
structured parse come back together so the PDF's page tokens are paid for once.
Roughly $0.03–0.05 for a two-page resume on `claude-sonnet-5`, which is a current model
ID rather than a guess. The function runs once per analysis, never once per upload —
storing a PDF reads nothing, and the client's analyze mutation is the only caller.

Deno, raw `fetch`, no SDK. The PDF goes up as an Anthropic `document` content block —
which is what lets the model judge layout rather than just text — and the response is
constrained by `output_config.format.json_schema`. That is generally available; there
is no `anthropic-beta` header, and `output_format` is the older beta spelling of the
same thing.

Five modules under [`_shared/`](supabase/functions/_shared): `cors.ts`, `schema.ts`
(the JSON Schema and the seven category specs), `prompt.ts` (built from those same
specs, so a category can't be described one way and scored another), `validate.ts`,
and `pdf.ts`.

**The token budget, which is one budget and not two.** `claude-sonnet-5` runs
[adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
by default at `high` effort, thinking tokens are generated into the same stream as the
answer, and `max_tokens` caps the total. Sized at 8000 — enough for the report alone —
the first live call spent most of the budget thinking and then truncated the report,
returning `stop_reason: "max_tokens"`. A truncated structured response is unparseable,
so it was billed in full and produced nothing. Now: `max_tokens` 20000, effort
`medium` (overridable with `ANTHROPIC_EFFORT`), and at most three findings per
category, asked for in the prompt and stated in the schema. Headroom is only billed if
it is used; effort is what decides whether it is.

**The analysis does not stream, and the reason is a hard limit rather than a preference.**
It did once, and the bar was genuinely honest: twelve milestones, each announced when
`"id": "<category>"` appeared in the accumulating JSON. It cost a paid run to learn that
this is unaffordable. **The edge runtime charges CPU per frame of the upstream body**, and a
7,000-token answer with adaptive thinking arrives in thousands of them. A real analysis was
killed on that limit at 84 seconds, mid-answer, after the tokens were billed.

Measured, because the first two explanations were wrong:

| | |
| --- | --- |
| Our own JavaScript, 1,500 frames | **365 ms** |
| Runtime CPU **soft** limit reached | ~500 frames |
| Runtime CPU **hard** limit reached | ~1,500 frames |

A quarter of a millisecond per frame of our code, against a budget the runtime had already
spent. Reproduced for free before any of this was believed: the stub's
`STUB_THINK_FRAMES=4000 STUB_CHUNK=5 STUB_SPREAD_MS=85000` kills an isolate exactly the same
way, and the fixed non-streaming path survives a 90-second wait in the same harness.

So the model call is **one** non-streaming request read by `readModelResponse`: one body, one
parse, no per-frame toll. **The rewrite pass still streams** — a few hundred frames is well
inside the ceiling, and there the moving bar is real.

**Four steps, and one honest wait.** `Reading the document` → `Reading your resume` →
`Checking the report over` → `Saving the report`. The second is the model call and takes the
best part of a minute with nothing observable inside it, so it is not dressed up as
progress: `waiting` heartbeats carry elapsed and expected time every six seconds, the solid
fill holds still, a paler fill creeps toward the next step in proportion to elapsed against
typical and stops dead at that boundary, and the caption counts seconds. Overrun says so
rather than pinning at 99%. Fifteen heartbeat frames on a long run, against the thousands
that made streaming unaffordable.

The response to the browser still streams, and that half was never optional. The first real
call spent 201 seconds inside one `await fetch` and the runtime terminated the isolate for
exceeding its wall clock — from the browser, a paid analysis simply vanished. An open
response with a heartbeat on it cannot vanish silently.

**The wire contract**, written out on both sides of the seam — in `edge.ts` and in
the function's own header — because the two halves were built independently. The
boundary is the first byte written, since a status line can't be revised afterwards:

| | |
| --- | --- |
| Request | `POST`, JSON `{ resumeId: string, force?: boolean }` |
| non-2xx | JSON `{ error: string }`, written for a human and shown verbatim. Everything that can refuse for free refuses this way |
| 200 | NDJSON, one object per line: `{ type: "progress", step, total, label }` and `{ type: "waiting", elapsedMs, expectedMs }`, then either `{ type: "done", analysis }` or `{ type: "error", message }` |

**Only `done` means an analysis exists.** A failure during the model call arrives as an
`error` event on a 200, and a stream that ends with neither event was cut off — a
distinct outcome with its own message, because the call may well have been billed.
`functions.invoke` is not used for this: it resolves with the whole body, which would
collapse the stream back into one long wait.

**The whole path is testable for free**, which matters when every failure past the first
byte is billed. `ANTHROPIC_BASE_URL` overrides the endpoint;
[`_stub/anthropic.ts`](supabase/functions/_stub/anthropic.ts) answers both shapes, chosen the
way the real API chooses — `stream: true` gets SSE frames, its absence gets one JSON body —
and `_stub/mint-jwt.ts` signs a local user token so the function can be driven with `curl`.
Neither is wired into anything — the `_` prefix keeps them off the deploy — and both are
local-only by construction, since the JWT secret they use is the CLI's fixed development one.

Its knobs exist because the failures that cost money are the slow ones, and a stub that
answers in eight seconds cannot reproduce them: `STUB_WAIT_MS` holds a non-streamed response
back so the waiting caption and the paler fill can be watched over a real 90 seconds, and
`STUB_SPREAD_MS` / `STUB_THINK_FRAMES` / `STUB_CHUNK` reproduce the frame volume that killed
the streamed analysis. Used this way they proved the four steps, fourteen heartbeats
reporting real elapsed time from 6 to 84 seconds, the validator, and the `resume_reports`
write — before a token was spent on any of it.

**Four guards run before a single token is spent:**

1. An existing report refuses a re-run with 409 unless `force`.
2. A time-boxed in-flight lock, held for three minutes.
3. The plan's allowance — one analysis a month on free — counted over `ai_usage`.
4. 15 pages and 10 MB, both checked against the real bytes.

The lock is the one with a trap in it — see §10.

**Guard 3 used to be the hole and is now the fix.** It was ten a day counted over
`resume_reports`, which are *successful* analyses: a call that reached Anthropic, was
billed, and then failed validation left no row and never counted, so a repeatedly failing
analysis could bill straight past the cap. That was survivable at ten a day and is not at
one a month, which is what the free tier became once the app was publicly reachable.

So the count moved to `ai_usage` (migration `0006_ai_quota.sql`), a ledger of **attempts**.
`spendAllowance` writes the row immediately before the model call — after every guard that
can refuse for free, and before the 200 that can no longer carry a refusal — so what is
counted is what is charged. A failed run costs the user their allowance, which is the
deliberate half of the trade: the alternative is a free retry loop at ten cents a go.

Two things make the allowance real rather than advisory:

- **`plan` is not client-writable.** `user_settings` had a `for all` policy and a
  table-wide `update` grant, so any signed-in user could `PATCH` themselves to `pro`.
  0006 narrows the `update` *and* `insert` grants to the columns the app actually
  writes — insert too, because `delete` was granted as well, so the row could otherwise
  be dropped and re-inserted as `pro`.
- **The ledger cannot be rewound.** `ai_usage` grants `select, insert` and deliberately
  not `update, delete`. Inserting spends an allowance, so a forged write only harms the
  forger; raising one would need a delete.

The limits themselves live in [`_shared/plans.ts`](supabase/functions/_shared/plans.ts),
which the React app imports too, so the number displayed next to a button is by
construction the number the function enforces. It sits under `supabase/functions/` because
the deploy bundle can only follow imports inside that tree, while Vite can reach anywhere.

**None of this is a substitute for a billing cap on the account** — it bounds one user,
not the sum of them. A monthly cap is now set at `console.anthropic.com`.

**The schema shapes the code more than you'd expect.** Anthropic's structured outputs
drop numeric and string-length constraints silently, cap optional properties at 24 and
union-typed ones at 16 across a request, and don't guarantee enum casing. So scores are
clamped and severities lowercased in `validate.ts` rather than trusted from the schema,
and `AtsFinding.evidence` is a required string where empty means absent. The bias in
`validate.ts` is repair over rejection: by the time it runs the tokens are paid for, so
only a genuinely unusable response — a missing category, a non-numeric score — throws.

Those two budgets are why the parse looks the way it does. Nothing in the schema is
optional, and the seven `["string","null"]` unions are all on `parsed`, where "the resume
does not state this" is worth representing exactly. **Education, project and certification
dates are therefore verbatim strings** — `"Aug 2018 – May 2022"`, `"Expected 2027"` — not
normalised pairs: three more nullable date pairs would have spent six union slots on
information nothing computes with, and the rebuild wants the printed text anyway.
Experience dates are normalised to ISO precisely because the profile *does* compute with
them.

**Education, projects and certifications arrive as one array tagged by `kind`, and the
three-arrays version of that is what taught the lesson twice.** Defining the shape once in
source and referencing it three times does nothing for the grammar: what is compiled is the
schema as sent, so a shape used three times costs three times. Three sibling arrays of the
same four-property object was enough to push the analysis back over the ceiling —
`invalid_request_error`, "the compiled grammar is too large", exactly as the `categories`
object had done — so the wire carries one array with a `kind` enum and `validate.ts` splits
it back into the three arrays the rest of the app is written against. An unrecognised `kind`
becomes a project, which is what the prompt tells the model to do with anything that is
neither a degree nor a certificate: filing a publication under the wrong heading is
cosmetic, and dropping it from somebody's resume is not.

`report.layout` is an enum rather than something derived from the scores, and
`validate.ts` reads an unrecognised value as `single_column_text`. That direction is
deliberate: every other value makes the UI offer a rebuild, so guessing wrong the other way
would tell someone their perfectly ordinary resume is structurally broken.

**Status: six real Claude calls on 4 Aug 2026, all against the local stack. Two produced a
report; runs 4 and 5 are why this section was rewritten, and run 6 is the one that settled
the parse.**

1. **Rejected before billing** — `invalid_request_error`, "the compiled grammar is too
   large". Seven named category properties each inlining the same finding object
   compiles into a decoding grammar past the ceiling. Fixed by making `categories` one
   array with an `id` enum; §10 has the general rule.
2. **Billed and truncated** — `stop_reason: "max_tokens"`, most of the budget spent on
   thinking. Fixed by the token budget above. Cost about ten cents and produced nothing.
3. **Succeeded** — overall score 86 on a one-page resume, seven categories with 1–3
   findings each, five ranked fixes, and a parse of four roles and thirty skills. **8,516
   input tokens, 6,990 output, roughly 70 seconds, about $0.09** at the introductory
   $2/$10 per MTok. Output is where the money is, and thinking is output: over half that
   bill is reasoning the user never sees. `ANTHROPIC_EFFORT=low` is the dial if the
   report ever reads like more than it is worth.
4. **Rejected before billing, again** — the same grammar error, caused this time by the
   three parse sections added after run 3. Free, and it answered the question run 3 had left
   open. Fixed by the `kind`-tagged array above.
5. **Billed and killed** — the schema compiled, the answer streamed for 84 seconds, and the
   runtime terminated the isolate on its CPU limit before a single line of it was saved.
   Cause: per-frame CPU, not anything in this code. Fixed by not streaming the analysis.
   Cost five to nine cents and produced nothing.
6. **Succeeded, non-streaming, and the parse is complete this time** — overall 85, seventeen
   findings across seven categories, **80.6 seconds, 10,151 input tokens, 8,216 output,
   about $0.10** at introductory rates. Four steps and thirteen heartbeats, the last at 78
   seconds. The `kind`-tagged array split back into **one degree, five projects, no
   certifications** without a line of downstream change, and the bullet run 3 could quote
   but not parse — *"Contributed front-end features to a trade-route planning app…"* — is
   in this parse, under a project heading where it belongs. **Nine bullets across four
   roles**, against run 3's six: two roles that had one bullet each now have four and
   three. So the parse-completeness rules hold, and the `partialParse` guard now has a
   report it will let through.

**Three of six real calls produced nothing, and two of those three were billed.** Every one
of the causes was found for free afterwards, against the stub, which is the argument for the
stub knobs above: the failures that cost money are the slow ones, and a stub that answers
instantly cannot reproduce them.

The plumbing was proven against the stub before run 6 spent anything: the four steps,
fourteen heartbeats over a 90-second wait, NDJSON reaching a client incrementally,
`validate.ts` on a schema-shaped response, the `resume_reports` insert with its token counts,
and the status transitions around it. Run 6 then confirmed all of it against the model,
including the one thing a stub cannot answer — whether the prompt's parse rules survive
contact with a real document.

**One narrow risk found while proving this, and not yet fixed:** every database write in
this function runs under the caller's JWT, so an analysis that starts near the end of a
token's hour finishes into `PGRST303 JWT expired` and loses a report that was paid for. It
happened here with a deliberately stale token and produced exactly that: a complete,
validated, billed report discarded at the insert. A 90-second job wants either a refreshed
token or a service-role write for the final insert.

**The spend cap at `console.anthropic.com` is now set**, which was overdue: the argument for
it stopped being hypothetical the moment a billed call returned nothing, and that had
happened twice. The per-user allowance above is the other half — the cap bounds the account,
the allowance bounds each person who signs up, and neither substitutes for the other.

### The `improve-resume` Edge Function

The report says a bullet has no measurable outcome. This is the button that writes the
better bullet. **One press rewrites everything at once** — one model call for the whole
report, not one per finding, which is the difference between a couple of cents and thirty
of them. Text only: the parse and the findings are already stored, so the PDF's page
tokens are not paid for twice. Measured at **$0.012**, an eighth of an analysis.

It shares the analyzer's machinery rather than copying it. `_shared/model.ts` holds what
both need — the env reader, the Anthropic version pin, the error type, and both response
readers. Same wire contract as §8: `POST { resumeId, force? }`, refusals as non-2xx
`{ error }`, a 200 of NDJSON ending in `done` or `error`.

**This is the one that still streams from the model**, and it can afford to for a reason
rather than by luck: its answers run to a few hundred frames, well under the ~1,500-frame CPU
ceiling that forced the analysis off streaming entirely. So its bar is the honest kind —
counted off completed `"suggested"` properties as they arrive, one step per rewrite actually
written. Counted forward from a cursor, not by re-matching the buffer each delta, and the
cursor is held by hand because a failed `exec` resets `lastIndex` to zero and would recount
every key from the start.

Same guard shape too — already improved (409 unless `force`), a three-minute in-flight
lock, and the plan's rewrite allowance, one a month on free. It counts over `ai_usage`
like the analyzer now does. Before that it counted `resume_improvements`, which are
written *before* the model call here, so it happened to bound attempts rather than
successes — the right behaviour by accident of ordering, and now the right behaviour on
purpose in both functions.

The rewrite has its **own** allowance rather than sharing the analysis one. It only exists
to act on a report, so a user who has spent the month's analysis should still be able to get
the rewrites that go with it; sharing a counter would make the second half of the feature
unreachable for anyone who used the first.

**What it refuses to do is most of the design.** The prompt may only rewrite lines it was
given, and `validate.ts` enforces that independently: `rewritableLines` builds the set of
lines the parse actually contains, and a rewrite whose `original` doesn't match one
verbatim (whitespace, case and trailing punctuation aside) is discarded rather than
guessed at. The same function feeds the prompt and the validator, so the two can't
disagree about what a rewritable line is. Also dropped: rewrites identical to the
original, and duplicates for a line already rewritten.

**It never invents a number.** The model is told to write `___` where a figure belongs
but the resume never stated one, which is what the user chose over the alternatives —
a rewrite with a blank in it is honest and a rewrite with a plausible number in it is a
lie the user then has to defend in an interview. `hasBlank` is read off the text rather
than trusted from a model flag, because the text is what gets sent. And because the
instruction alone is not enforcement, `figureFlag` compares the digits in the suggestion
against the digits in the original: anything new is **flagged, kept, and excluded from
"accept all"**, so it can only be accepted deliberately, one click at a time.

Findings the model is told not to rewrite: anything about layout, page count, or missing
contact details. None of those is fixed by better wording — the rebuild in §11 fixes the
first two, and only the user knows their own city.

**Accepted rewrites change the document and nothing else.** `src/lib/resume/edits.ts`
substitutes them into the parse by matching `original` against the parse's own text, and
the rebuilt DOCX or PDF is generated from the result. The profile is untouched, which is
the user's choice and also the safer default: a rewrite with a `___` in it belongs in a
file someone is about to edit, not in the store the tailoring reads from. Matching is on
text rather than on any index into the parse, so a rewrite can't land on the wrong
bullet; the cost is that a rewrite whose line has since changed matches nothing, and that
case is reported on screen rather than swallowed. **Legacy parses are handled by shape,
not by version:** a report stored before the parse captured summary, education, projects
and certifications has no such keys, and the apply step passes an absent section through
as absent instead of substituting an empty array — which would leave the rebuild
believing the resume simply has no education. This was a real crash, caught against a
real stored report, not a hypothetical.

**Status: working, and cheaper than estimated.** First real call on 4 Aug 2026, against the
real report from run 3 above: **3,415 input tokens, 537 output, about 10 seconds, ≈$0.012**;
a third, over run 6's complete parse, cost **≈$0.013**.
Roughly an eighth of an analysis, because the resume's pages are already paid for and the
answer is a few sentences rather than a full report. It returned **one** rewrite — the
deduplication bullet, restructured with `___` where the figure belongs and a note saying
what to fill in, no invented number, no flag. The schema compiled, which was the one open
question.

**One rewrite looked like under-coverage and was two different things, only one of them a
bug.** The report's third finding named a bullet by quoting it — *"Contributed front-end
features to a trade-route planning app…"* — and **that bullet was not in that parse at all**.
Two roles carried a single bullet each. So the rewriter could not have touched it: `original`
must match a stored line, and the line was never stored. A second pass after loosening the
prompt returned the same single rewrite, which is the evidence that the prompt was never the
constraint. **That defect was upstream, in the analysis, and run 6 fixed it** — nine bullets
where there had been six, and the trade-route line present under a project heading.

**The second real pass, over the complete parse from run 6, also returned one rewrite — and
this time one is the right answer.** 3,904 input tokens, 524 output, 9.7 seconds, ≈$0.013.
Of seventeen findings, eleven are `pass` — nothing to fix — and of the six that are not,
exactly one names a change to the words of a stored line: the deduplication bullet with no
quantified outcome, returned with `___ to ___` where the figure belongs and a note naming
two different numbers that would do. The other five are **not rewritable by construction,
and refusing them is correct**: a missing location and a missing summary cannot be written
without inventing facts, a non-standard section heading and inconsistent date formats are
structure rather than prose and live outside the rewritable set, and a skill listed twice is
a deletion from a list rather than a rewrite of a line. So the honest reading is that this
resume is well written and the ceiling is the resume, not the rewriter.

**The narrower lesson stands, and it is the reason run 6 mattered: a finding's `evidence` is
not guaranteed to be a rewritable line.** Evidence is quoted from the document, the rewrite
set is drawn from the parse, and the two are only the same if the parse is complete. Worth a
`parse` finding of its own — a resume whose bullets did not all survive extraction is exactly
what that category is for — and it is still not raised. Run 6's parse happens to be complete;
nothing in the report would have said so if it weren't.

The stub answers improve requests as well as analyses — it tells them apart by whether the
request carries a `document` block — and it deliberately returns one rewrite with a blank and
one that claims a figure the original never had, so the flagging path is exercised on every
run.
Against the real stored report on the local stack, that proved: streaming progress, title
and line matching, the flag, the blank, the `resume_edits` write, per-edit accept, accept
all, replacement on a forced fresh set, the three refusals (already improved, resume not
analyzed, unauthenticated), and the apply step landing two accepted rewrites in a real
parse — including the three cases worth having: a rewrite whose line has since vanished is
reported while the others still land, and dismissing everything leaves the parse
byte-identical.

## 9. Deploying

Push to `main`; Vercel builds and publishes. The SPA lives in `dist/`; **`api/render-resume-pdf.ts` is a Vercel serverless function** (Node + `@sparticuz/chromium` + `puppeteer-core`) that turns HTML templates into PDF. `vercel.json` rewrites exclude `/api/*` so the SPA catch-all does not swallow the route. Local `npm run dev` serves the same path via a Vite middleware using full `puppeteer`.

**Edge Functions deploy separately.** Vercel knows nothing about them, and a push to
`main` does not ship them:

```bash
supabase functions deploy analyze-resume
supabase functions deploy improve-resume
supabase functions deploy tailor-resume
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
```

Neither deploy has been run — both functions run only on this machine, under
`supabase functions serve` (§4). **The secret is set on the hosted project**, so that line is
done; they share it, so setting it once covers both. What this means in practice is that the
live site can store a resume but cannot analyse one, and `VITE_AI_PROVIDER` is deliberately
left unset on Vercel so the deployed build uses the sample provider rather than calling a
function that isn't there.

**Migrations on the hosted project are applied by hand, and the ledger is empty.** `0001`–
`0003` were pasted into the SQL editor, so `supabase_migrations.schema_migrations` does not
exist there and `supabase db push` would try to replay them against tables that already
exist and fail on the first `create table`. `0004` and `0005` were therefore applied the same
way, through the Management API's query endpoint, on 5 Aug. Either keep doing that, or run
`supabase migration repair --status applied 0001 0002 0003` once to backfill the ledger and
switch to `db push` from then on. Both are defensible; mixing them without the repair is not.

Six things a new environment needs:

1. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set **before** the build.
2. Unmatched paths rewritten to `index.html` (`vercel.json` handles Vercel).
3. The domain added to Supabase **Authentication → URL Configuration**, both as Site URL
   or in the redirect allow list.
4. Custom SMTP before anyone else signs in — see §10.
5. Every migration applied, `0004` and `0005` included — otherwise the resume screens 404
   on a table that isn't there.
6. Only if the real analyzer is wanted: **both** functions deployed, the shared secret set,
   a spend cap in place, and `VITE_AI_PROVIDER=edge` set **before** the build that ships
   it. Deploying `analyze-resume` without `improve-resume` leaves a live "Improve my
   resume" button calling a function that isn't there.

## 10. Gotchas

Things that have already cost time, or will.

- **Resume PDF is a Vercel Node function, not an Edge Function.** `@sparticuz/chromium` + `puppeteer-core` under `api/render-resume-pdf.ts`. Auth is the caller's Supabase JWT; body is `{ templateId, fields }` already owned by the client. `vercel.json` must exclude `/api` from the SPA rewrite. Locally, Vite middleware in `vite.config.ts` uses full `puppeteer`.
- **"Download PDF" 500s locally with "Could not find Chrome".** Installing the
  `puppeteer` package does not guarantee its browser: the post-install download is
  skipped whenever `PUPPETEER_SKIP_DOWNLOAD` is set or the install ran with a redirected
  `PUPPETEER_CACHE_DIR`, and the only symptom is a 500 from `/api/render-resume-pdf` while
  the HTML preview renders perfectly. Fix with `npx puppeteer browsers install chrome`
  (into `~/.cache/puppeteer`, not a temp cache), or point `PUPPETEER_EXECUTABLE_PATH` at a
  Chrome you already have. The middleware now tries the bundled browser, then the
  installed `chrome` channel, then that variable before failing with that instruction.
- **A new metered feature is two edits, not one.** Adding a value to the `Feature` union in
  `_shared/plans.ts` is not enough: `ai_usage.feature` has a check constraint listing them,
  so the first real run dies in `spendAllowance` with `23514` and the user sees the generic
  "Could not start this. Please try again." — the logs name the constraint, the UI never
  does. `0010` had to retrofit `tailor` for exactly this reason.
- **`applications.tailored_resume` is an envelope, not bare fields.** Writes include
  `{ fields, summary, changes, keywords, missingSkills, variant, briefs }` so Materials can
  restore without calling `tailor-resume` again. Legacy rows that are bare `ResumeFields`
  still parse; the next successful tailor upgrades them. Opening the tab must never spend.
- **Tailor spine used to hardcode education/projects/certs/location/links empty.** The
  analyze pass already extracted them; onboarding discarded them because the profile had
  nowhere to store them. `0011` adds the columns/tables; `loadSpine` queries them and falls
  back to `resume_reports.parsed` when tables are still empty so existing accounts are not
  blank until they re-confirm a parse.
- **Contact facts are pinned in code, not trusted to the prompt.** Tailor used to swap the
  login email onto the PDF and drop phone/links. `pinSpineFacts` (edge + client) overwrites
  fullName/email/phone/location/links and employer/title/dates from the spine after every
  tailor/enrich model call — but **not** after `mode: "edit"`, where the user may
  deliberately change contact. `loadSpine` prefers the base-parse contact over `profiles.email`
  (which is often the auth address). Phone only appears if the parse captured it — re-analyze
  after `0011` if an older report has `phone: null`.
- **`tailor-resume` has three modes.** Default = full JD tailor; `enrich` = skill-gap briefs;
  `edit` = follow-up instruction only. `constrainEdit` copies current fields and only lets
  through sections the instruction named (email, headline, bullet, …), so a chatty model
  cannot re-tailor the whole document. Edit and re-tailor both spend the `tailor` allowance.
- **`?? []` in a shared hook is an infinite render loop.** `useProfileContext` returned a
  fresh `[]` for `experiences`/`skills` while the queries were in flight, so every consumer
  keying an effect on `context.experiences` re-ran on each render and re-set state —
  "Maximum update depth exceeded" pointing at the *consumer*, which is the wrong file to
  debug. Fallbacks in hooks that hand arrays to effect dependency lists must be shared
  module constants.
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
- **A count of sources is not a count of grounding, and showing the former as the latter
  reads as a bug.** Two Google roles, same sidebar component: one said "1 source", the
  other "0 sources · Cold start" while its chat answered Google questions in detail and
  cited them. Nothing was broken — `sourceCount` counted `prep_sources` rows on *this*
  `application_id`, while `match_prep_chunks` matches any claim whose `company`/`role` is
  null or equal, so a role draws on (a) company-scope sources added under a sibling role
  and (b) shared claims (`prep_chunks.user_id is null`) contributed by **other accounts**,
  whose `prep_sources` row RLS correctly hides forever. So the panel now counts all three,
  labels inherited rows `company-wide` and offers no delete on them, and reports shared
  claims as a count rather than naming someone else's upload. **Any new count beside the
  chat has to mirror the retrieval predicate** — a filter added to `match_prep_chunks` and
  not to `useSharedClaimCount` starts overstating grounding immediately.
- **`normaliseCompany` exists twice on purpose, and the copies must not drift.**
  [`src/lib/company.ts`](src/lib/company.ts) and
  [`_shared/claims.ts`](supabase/functions/_shared/claims.ts) hold the same function
  because one is bundled by Vite and the other runs in Deno; neither can import the other.
  Catalog picks bypass this for prep keys (they use slug ids via `prepKeysFromApplication`).
  The free-text half still decides sibling UI matching and custom corpus keys — `"Google Inc."`
  and `"Google"` must both reduce to `google` on both sides.
- **Catalog slugs are the preferred prep keys.** When `applications.company_id` /
  `role_id` / `level_id` are set, ingest/chat/save write those ids into `prep_chunks`
  (`google`, `software_engineer`, `mid`). Customs still go through normalise +
  `stripRoleNoise`. Do not invent Mid≈L3 string maps for catalog rows — the level
  ladder is already generic (see PROJECT.md §16).
- **Referrals LinkedIn URL** is built by [`linkedinSearch.ts`](src/lib/linkedinSearch.ts):
  cleaned role + specialty as keywords; `currentCompany` when
  `catalog_companies.linkedin_company_id` is set. Without an org id it still falls back
  to company-in-keywords (imperfect). Do not hardcode `keywords=<company> <role>` in the
  component again.
- **`JWT issued at future` (`PGRST303`) on every local query is a stale container, not an
  auth bug.** After the Mac sleeps, the Docker VM clock jumps on resume and PostgREST's
  cached time can stay behind it, so it reads perfectly good tokens as coming from the
  future. Two things make this misleading: the message points at the token, and signing
  out and back in does not help, because the next token is just as "future" to a clock
  that is an hour behind. The tell is that a token minted **thirty seconds ago** is
  rejected too — if backdating the `iat` doesn't help, the verifier's clock is the
  problem. `supabase_rest_…` also loses its `(healthy)` marker in `docker ps` and stops
  writing logs. Fix is one container, not the stack:

  ```bash
  docker restart supabase_rest_PrepForMe
  ```

  Same family as the wedged Kong that presented as "the Profile page loads forever": when
  something local breaks everywhere at once after the laptop slept, suspect a container
  before the code. Comparing `date -u` on the host against `docker exec … date -u` costs
  a second and settles it.
- **The functions runtime injects `SUPABASE_ANON_KEY`, not `SUPABASE_PUBLISHABLE_KEY`.**
  Verified against the local runtime container on CLI 2.111.0: what it provides is
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
  `SUPABASE_DB_URL`. The publishable and secret keys appear only as
  `SUPABASE_INTERNAL_*`, which are the runtime's own bootstrap variables and not for
  function code. This is worth knowing precisely because the client half of this
  project has already moved to publishable-key naming, so the obvious guess is the
  wrong one, and the symptom is a function that looks configured and authorizes
  nobody. `analyze-resume` reads the anon name first and falls back through the others.
- **`max_tokens` is thinking plus answer, and Sonnet 5 thinks by default.** Adaptive
  thinking is on unless you pass `thinking: {type: "disabled"}`, effort defaults to
  `high`, and the new tokenizer produces roughly 30% more tokens for the same text than
  Sonnet 4.6 did. A budget sized for the answer alone is spent on reasoning and the
  answer arrives truncated with `stop_reason: "max_tokens"` — billed, and unparseable
  because structured output cut off mid-JSON is not JSON. Symptom in this app: the
  analysis "ran past its length limit". Remedy: raise `max_tokens`, or drop the effort
  level so less of it goes on thinking.
- **`output_config.effort` is not universal, and switching `ANTHROPIC_MODEL` can break
  every model call at once.** Haiku 4.5 rejects `effort` outright — `400
  invalid_request_error: "This model does not support the effort parameter."` — while
  still accepting the `format` half of the same `output_config`. Sonnet 5 takes both.
  Setting `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` to save money therefore took out
  résumé analysis, rewrites, prep chat, and claim extraction simultaneously, all
  presenting as "the model service could not process this request" with no bill to show
  for it (a 400 is refused before tokens are counted). Build `output_config` through
  `outputConfig(model, effort, format?)` in `_shared/model.ts`, which drops `effort` for
  models that refuse it, rather than writing the object inline. `supportsEffort` matches
  on model name and treats anything unrecognised as unsupported: guessing wrong that way
  costs a chattier answer, guessing wrong the other way costs the whole call.
- **Log the upstream body, not just the status.** `console.error("…failed", res.status)`
  reads as diagnostic and isn't: `400` alone sent the next session to `curl` to rediscover
  a message Anthropic had already spelled out by name. `logUpstreamFailure` in
  `_shared/model.ts` prints the first 500 characters of the body; use it for every
  non-`ok` model or embedding response.
- **`early termination has been triggered` is usually not your request dying.** Under
  the local `edge_runtime` policy `per_worker` (the default, and what gives hot reload)
  one worker serves many requests and is reaped about 200 seconds after it *starts*. So
  `wall clock duration warning` followed by `early termination` appears roughly 200
  seconds into the worker's life regardless of what any individual request did — it
  showed up at 201s next to a request that had failed on `max_tokens` two seconds
  earlier, and again at 200s next to one that had *succeeded* after 70. Both times it
  was read as the cause. Check the outcome — the `resumes.status` row, or the last
  stream event — before believing the log line. The limit is real and does bound a
  single long request, but it is not evidence about one.
- **A second `supabase functions serve` takes over the one shared runtime container, and
  its `--env-file` wins.** Starting a stub-pointed serve alongside an existing one does not
  give you two servers on two ports: the second reconfigures the same container, its logs
  are multiplexed into whichever terminal is attached, and **killing it leaves the container
  running on its env**. So a stub session can silently outlive itself, and the next
  "Analyze resume" reaches an endpoint that is no longer listening — or, in the other
  direction, a run you believed was stubbed reaches Anthropic. The tell is the
  `using a non-default model endpoint` line, which `readEnvironment` logs per request
  whenever `ANTHROPIC_BASE_URL` is set. To check which env is live without spending
  anything, POST an already-analyzed `resumeId` with no `force`: the 409 refusal happens
  after the env is read and before any model call. Run one serve at a time, and restart it
  after stub work rather than just killing the stub.
- **`name resolution failed` means the function server is down, not that DNS or Anthropic
  is broken.** With no `supabase functions serve` running there is no `edge_runtime`
  container for Kong to resolve, so the *gateway* answers
  `503 {"message":"name resolution failed"}`. It reads like a network fault inside the
  function — as if it could not reach `api.anthropic.com` — and it is the opposite: the
  request never got as far as our code, and nothing was billed. Confirm with
  `docker ps | grep edge_runtime`, then start the server. The message used to reach the
  UI verbatim because `refusalMessage` in [`src/lib/ai/edge.ts`](src/lib/ai/edge.ts) read
  `message` as a fallback after `error`; it now trusts only `error`, which is the sole
  field `errorResponse` ever writes, and maps every other status to its own wording. Same
  fix covers the deployed case, where an undeployed function 404s and Supabase's
  worker-limit 546 arrives with no body at all. Note that the *same* stopped server
  produced a prompt 503 on one attempt and hung until the socket gave up on the next, so
  status handling alone does not cover it — a hang rejects `fetch`, which has no status to
  map. Both paths now end in `unreachableMessage`.
- **Anthropic structured-output schemas have a property budget: 16 union-typed and 24
  optional, per request.** Inlining the finding object across seven categories with
  `evidence` typed `string | null` spent 13 of the 16 before anyone noticed; `evidence`
  is now a required string where empty means absent. In the same family: numeric and
  string-length constraints are dropped from the schema silently, so a range you
  declared in JSON Schema is a range nothing enforces. Score bounds are clamped in
  `_shared/validate.ts` instead, which is what keeps them inside the
  `check (overall_score between 0 and 100)` on the table.
- **The client writes no `resumes.status` at all** — not `analyzing`, not `analyzed`,
  not `failed`. The Edge Function is the only writer. It sets `analyzing` itself,
  immediately before the model call, and refuses another run while that is under three
  minutes old, which is the entire thing standing between a double-click and two billed
  calls. Both halves of that have already gone wrong. An earlier `runAnalysis` in
  [`src/data/resumes.ts`](src/data/resumes.ts) set `analyzing` first, which would have
  made the request that set it refuse itself. And its `catch` wrote `status: 'failed'`
  on *every* thrown error — including the function's own 409 "already being analyzed"
  refusal, which meant the refusal released the lock it existed to protect: press once
  and get refused, row flips to `failed`, press again and get billed. `runAnalysis` is
  gone; the mutation calls `ai.analyzeResume` directly and leaves the row alone on both
  success and failure. Anyone re-adding a client-side status write removes the spend
  guard while appearing to strengthen it. The window is time-boxed so a run that dies
  without recording an outcome expires rather than wedging the resume permanently.
- **One number, two deployables.** `ANALYZING_STALE_MS` in
  [`src/data/resumes.ts`](src/data/resumes.ts) must equal `ANALYSIS_LOCK_MS` in
  `supabase/functions/analyze-resume/index.ts`, and nothing enforces it — there is no
  module both sides can import across that gap. Both are three minutes. Believe an
  `analyzing` row for longer than the function does and the user watches a spinner for
  a run that has already stopped; believe it for less and the screen offers a button the
  function answers with a 409. Change one, change the other.
- **Local functions need their own env file** — `supabase start` doesn't serve them and
  the runtime doesn't read the root `.env.local`. See §4.
- **A nested click handler double-opened the file picker.** The drop zone and the
  "Choose a file" button inside it both called `input.click()`, so the click bubbled
  and queued a second OS dialog that replaced the first before its selection could be
  read. The picker appeared to reopen on every pick and nothing ever uploaded, which
  reads as a browser or OS fault rather than an application bug. `PrimaryButton` in
  [`src/components/ui.tsx`](src/components/ui.tsx) takes `onClick?: () => void` and
  never receives the event, so it cannot call `stopPropagation`; the fix was to drop
  the inner handler and let the click bubble to the single handler on the zone.

## 11. The rebuild: generating a resume in the browser

`src/lib/resume/` writes a new resume from `ResumeAnalysis.parsed`. No network, no model,
no server — which is why it is free to run, instant, and safe to iterate on.

**Why generate rather than edit.** PDF stores where marks sit on a page, not a flow of
text, so "make this one column" means re-flowing a document with no flow to re-flow. A
Word original could genuinely be edited in place, but DOCX uploads are refused today
(§6, storage), so there is no Word original to edit. Generating from the parse is the only
version of the fix that can be relied on, which is why the UI calls it a new document and
never an edit.

**One model, two renderers.** `document.ts` flattens the parse into a list of blocks —
`name`, `contact`, `heading`, `subheading`, `paragraph`, `bullet` — and both renderers
consume only that, so they cannot disagree about content or section order. The list is
flat because an ATS reduces any resume to a single stream of lines anyway; building that
stream deliberately is the whole exercise.

**Why no dependencies.** A DOCX is a ZIP of XML and a text-only PDF uses a small corner
of the format, so `zip.ts` (stored entries, CRC-32, central directory) and the two
renderers together cost **21 kB** of bundle. A document library would have cost several
hundred and would have needed lazy-loading to justify itself. The output is also the
point: it is much easier to guarantee that a file contains no table, text box, column or
image when the writer has no way to express one.

Three constraints are load-bearing:

- **`xml:space="preserve"` on every DOCX run.** Without it a leading or trailing space in
  the candidate's own text is dropped, and copying their text verbatim is this code's one
  job.
- **PDF text is written in WinAnsi with base-14 Helvetica**, so nothing is embedded and no
  glyph can be missing at the reader's end. The cost is an 8-bit encoding: a name in
  Devanagari or Han cannot be written at all. `pdfUnsupportedCharacters` reports it and
  the UI **withholds the PDF**, offering the Unicode-safe DOCX instead — substituting
  question marks into someone's name is not an acceptable alternative.
- **PDF bytes are Latin-1, one byte per code unit.** A `TextEncoder` would emit UTF-8 and
  double every byte above 127, corrupting both the text and the cross-reference offsets
  that point at it.

**Accepted rewrites arrive here, and only here.** The rebuild renders the parse *after*
`applyAcceptedEdits` has substituted them, which makes this the one place a rewrite
becomes something an employer reads. The document says how many landed, and says so
loudly when an accepted rewrite still has a `___` in it — a file with a blank in it is
worse than the bullet it replaced, right up until someone fills it in.

**A stale report is refused, not rendered.** `resume_reports.parsed` is jsonb, so a row
written before the parse covered education, projects and certifications is missing those
keys entirely. `readParse` in [`src/data/resumes.ts`](src/data/resumes.ts) defaults them
to empty arrays *and* sets `partialParse`, preserving the difference between "this resume
has no projects" and "nobody looked". The rebuild refuses on `partialParse`, because the
alternative is handing someone a resume with their degree missing and letting them find
out after they send it.

**Verification.** Both writers were checked outside the browser: `unzip -t` and `xmllint`
on every DOCX part, and macOS's own PDF engine — `mdimport` for the extracted text layer
and page count, `qlmanage` to render. Rendering caught a bug nothing else would have: the
fill colour was inverted, so body text was painted white. It extracted perfectly, passed
every structural check, and rendered as an almost blank page.

## 12. Not wired yet

Discover's job-feed queries, the browser extension, Practice, drag-and-drop on the
kanban board. Each of these says so on screen rather than pretending. The scoped
retrieval infrastructure — pgvector, `prep_chunks`, `match_prep_chunks` — landed in
migration `0007`; see §8 (`prep-chat`) and [PROJECT.md](PROJECT.md) §13.

Resume upload has moved off this list, with one caveat worth stating plainly: the
analyzer has run for real (§8), but **the rewrite pass has only ever run against the
stub**, and under the default provider neither runs at all. That default is still what
every deployed build uses, though local dev no longer does (§4), and every report on
screen there is the labelled sample. Two things follow from that which are deliberate
rather than broken. `resumes.page_count` stays null, because only the Edge Function
estimates it.
And no `resume_reports` row is written at all, because a sample must never be stored as
if a model produced it — which also means a sample lives in the React Query cache and
nowhere else, and a page reload loses it. Sample rewrites behave the same way, for the
same reason, so accept and dismiss work in local mode but do not survive a refresh.

`tailorResume`, `atsGap`, `draftReferralNote` and `suggestReferrals` are still local in
both providers — `edge.ts` delegates them to the mock deliberately, and each result
carries its own `model` label so no screen ever claims a model was called when one
wasn't. `answerPrepQuestion` is wired to `prep-chat` when `VITE_AI_PROVIDER=edge`.
