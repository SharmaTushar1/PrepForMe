# PrepFor.Me — Build Plan to First MVP

*Prioritized, step-by-step roadmap from today's CRUD skeleton to a sellable v1. Companion to [PROJECT.md](PROJECT.md) (strategy) and [TECHNICAL.md](TECHNICAL.md) (stack/schema). Read PROJECT.md §13 first — it says design the corpus data model before building more prep UI, and this plan honors that.*

**Created:** 3 Aug 2026 · **Updated:** 4 Aug 2026
**Where we are:** working multi-user CRUD skeleton, deployed, plus a base-resume upload and ATS analysis whose model call has been written but never run. **Still zero real AI calls — but local dev is now wired to the real analyzer, so the next press is a real bill on an uncapped account.**
**Where MVP is:** the moment resume-in → tailor → company-specific prep chat → log notes → prep visibly deepens all work with a *real model*. That's the end of Phase 2 below.

---

## Part A — What we have right now

### Working, persisted, multi-user (the skeleton is real)
- **Auth** — magic-link sign-in, session guard, query cache cleared per account.
- **Database** — 19-table Postgres schema, RLS on every table, Data API grants applied, triggers (seed profile/settings on signup, stage-event history, `applied_at` stamp, `updated_at`). Mostly on Supabase Mumbai as well as the local stack: the first 14 tables since 2 Aug, and `0004`/`0005`'s four resume tables plus the private Storage bucket since 5 Aug, applied by hand because the hosted project has no migration ledger (see TECHNICAL.md §7) and verified equal to local table-for-table, policy-for-policy, grant-for-grant. **`0006` — the `ai_usage` allowance ledger and the narrowed `user_settings` grants — is local-only so far, and the hosted project must not get the Edge Functions before it does:** without it the functions would fail their allowance check, and with the old grants a user could still make themselves `pro`.
- **Profile spine** — view/edit structured profile: experiences, bullets (toggleable), skills. Not text blobs.
- **Base resume** — PDF upload from onboarding or the profile into a private per-user Storage bucket, then a separate explicit "Analyze resume" press, since the upload itself calls no model. Plus an ATS report screen and a parse review that writes roles, bullets and skills onto the spine only once the user ticks them off. Every state is built against the local sample: empty, uploading, stored-but-unread, refused, failed, stopped-partway, analyzed. Not yet applied to the hosted project.
- **Application tracker** — add/edit roles, stages `Saved → Applied → Screen → Technical → Onsite → Offer` (+ Rejected/Withdrawn). Stage history append-only.
- **Recaps (interview notes)** — logged with real text and persisted.
- **Metrics** — response rate, interview rate, active applications, interviews this week, prep readiness — all derived from real rows, not constants.
- **Application detail** — four tabs present in UI: Company Prep, Materials (tailoring), Recaps, Referrals.
- **Settings** — editing, JSON export, per-application corpus clearing.
- **Landing page** — polished marketing site.
- **Discipline** — empty/loading/error states throughout; clean state-ownership (React Query / URL / ephemeral store); `AiProvider` seam with two implementations, picked by one environment variable that defaults to the one that can't spend money — though local dev has since opted out of that default, see below.

### Present in UI/schema but NOT real yet
- **The resume analyzer is real; nothing else is.** It answered on 4 Aug — latest run overall 85, seven categories, seventeen findings, a complete parse, ~80 seconds, ~$0.10 — after three failed attempts that cost about fifteen cents and taught the schema, the token budget and the no-streaming rule their current shape (TECHNICAL.md §8). The rewrite pass over that parse is real too, at about a cent. Tailoring, ATS gap, prep chat and referral drafts remain local keyword-based stubs on both providers.
- **The analyzer is switched on in local development, and nowhere else.** `.env.development.local` sets `VITE_AI_PROVIDER=edge` and the Anthropic key is in `supabase/.env.local`, so with the function served, pressing "Analyze resume" under `npm run dev` bills a real key against an account with no cap on it. Nothing spends on its own — the press is always explicit, and storing a file reads nothing — but "a dev machine can't spend money by accident" stopped being true of this machine, and has since stopped being hypothetical too. Nothing is on anywhere else, though less of that is now true: `0004` and `0005` **are** applied to the hosted project and its Anthropic secret **is** set, but neither Edge Function is deployed and `VITE_AI_PROVIDER` is unset on Vercel, so the deployed build uses the sample provider. The live site can store a resume and not analyse one — which is also what keeps a public URL from spending money.
- **The rebuilt PDF download is reported as badly formatted** (5 Aug, from the rewrite flow). Undiagnosed, and the first job is deciding whether it is a bug at all: a rebuild is *meant* to discard the original layout, so this may be the intended reflow surprising its reader rather than the writer producing broken output. Cheapest discriminator is the DOCX from the same parse — same `ResumeDocument` input, different writer — and after that, a rebuild with rewrites accepted versus all dismissed, since rewritten bullets are longer and stress the wrapping. Suspects if it is real: `src/lib/resume/pdf.ts` and `pdfFont.ts`, hand-rolled text layer, wrapping, pagination and WinAnsi encoding. **Judge it by opening the file, not by reading the code** — this writer has already shipped one bug (white-on-white text) that was invisible to inspection. PROJECT.md §14.
- **The daily cap counts successes, not spend.** `assertUnderDailyCap` counts rows in `resume_reports`, so a call that reaches Anthropic, gets billed, and then fails validation never moves the counter — the ceiling is ten *saved* analyses a day, and an analysis that keeps failing can bill straight past it. The honest fix is an attempts ledger, a row written before the model call rather than after; that's a migration and isn't being done now. Open defect (TECHNICAL.md §8), and one more reason step 1 below is the only real guard.
- **The moat (RAG prep) does not exist** — no pgvector column, no embeddings, no company-info ingestion, no scoped retrieval. Prep chat only echoes the user's own bullets/JD/recaps.
- **Corpus data model missing** — no `(company, role, level, interview_type)` content key, no provenance tag, no corroboration count (PROJECT.md §13 flags this as the thing to design first).
- **Discover** (job feeds), **Practice**, **browser extension** — placeholders.
- **Unused tables** — `referral_contacts`, `tailorings`, `tailoring_changes`, `ats_keywords` exist and are policied but nothing reads/writes them.
- **Kanban drag-and-drop** — not built.
- No tests, no CI, no linter, one 724 kB bundle. *(The spend cap is now set, and a per-user allowance sits in front of it — see Part B step 1.)*

### One thing to fix immediately (honesty)
The landing page headline shows **"2.4× higher response rate."** PROJECT.md §5 explicitly forbids "false Nx-your-chances" multiplier claims. Replace it with an honest, mechanism-based stat (or a testimonial/coverage stat) before showing this to testers or paying users.

---

## Part B — Where to start (do these first, in order)

These are the immediate on-ramp before feature work. None is optional; each unblocks the rest.

> **On "spend per user":** the rupee figures in PROJECT.md §8 (≈₹10/user cheap tier, ≈₹220/user premium) were *cost projections*, and as of 5 Aug there is something configured behind them. **Two limits, doing different jobs:** a monthly cap at Anthropic, which bounds the bill, and a per-user allowance in `0006`, which bounds any one signup's share of it — one analysis and one rewrite pass a month on the free plan. The allowance counts *attempts*, not saved reports, because the measured data points say why: a one-page analysis costs $0.09–0.10 with over half of it thinking tokens, a rewrite pass about a cent, and **roughly fifteen cents of the total bought nothing at all** — two analyses billed and then lost, one to a truncated answer and one to a runtime CPU kill. A limit counting only successes would not have counted either of those.

1. ~~**Pick and create an LLM provider account, and set a hard spend cap + billing alert.**~~ **Done, Anthropic, monthly cap set on 5 Aug** — after the rule in PROJECT.md §7 had been broken three times, so the sequencing lesson stands even though the item is closed. **A cap alone was never enough once the app was publicly reachable:** it bounds the account, not the individual, so one stranger with a script could exhaust the month for everybody. The per-user allowance in `0006` is the other half — one analysis and one rewrite a month on the free plan, counted over an attempts ledger so a *failed* billed call still counts. See TECHNICAL.md §8.
2. ~~**Stand up the server-side provider seam.**~~ **Done.** `supabase/functions/analyze-resume` is the first Edge Function; `src/lib/ai/edge.ts` is the second `AiProvider`, selected by `VITE_AI_PROVIDER`, with `mock.ts` still the default. The key lives in the function's env, never in the bundle. Served locally and pointed at from `npm run dev`. The call has now run for real and returned a report; the two failures before it were about the schema and the token budget, not the seam (TECHNICAL.md §8). The response streams, and the UI draws progress from it.
3. **Ship the corpus data-model migration (`0007`).** Add the `(company, role, level, interview_type)` content key, a `provenance` tag, a `corroboration_count`, and a `pgvector` embedding column to the prep content tables. This is PROJECT.md §13's "design before building more prep UI" step — retrofitting it later is far more expensive. *Renumbered three times: `0004` went to the base resume, `0005` to the rewrite tables, `0006` to the per-user AI allowance.*
4. ~~**Wire real resume parsing** (`parseResume`) through the new provider.~~ **Done, in a better shape than planned:** the PDF goes to Storage on one press and one Claude call returns an ATS report and a structured parse together on a second, reviewed item by item before anything reaches the profile. Two presses because the analysis is the only part that costs anything. Onboarding's front door works, and the seam is proven end to end against the real model: a scored report and a parse of four roles and thirty skills, from an actual PDF.

---

## Part C — Prioritized feature roadmap (highest → lowest)

### Phase 0 — Foundations (Part B above)
Done: Edge Function provider · resume parsing · resume rewriting · spend cap · per-user allowance. **Outstanding: deploying both functions to the hosted project · corpus migration `0007`.**

### Phase 1 — Make truthful tailoring real (P0)
- Replace mock `tailorResume` + `atsGap` with real model calls behind the Edge Function.
- Persist to the existing `tailorings` / `tailoring_changes` / `ats_keywords` tables (wire the dead tables).
- Keep the truthful-reframe constraint and the "show what changed and why" transparency panel.

### Phase 2 — Build the moat: company prep RAG + compounding loop (P0, the differentiator)
- **Ingest** first-party company info (DIY fetch + Readability/Cheerio) for a given company.
- **Embed** with `text-embedding-3-small`; store in the pgvector column from migration `0007`.
- **Scoped retrieval** by `(company, role, level, interview_type)` metadata filter → real prep chat answers.
- **Provenance on every answer** ("company site" / "N candidate reports" / "general pattern" / "AI-inferred, unconfirmed"). Never present fabricated company-specific facts (PROJECT.md §3).
- **Close the loop:** logged interview notes feed back into the prep space, and the UI *shows* it deepening ("prep space levels up").
- **Cold-start grace:** thin scope falls back to company-level + general role knowledge, stays useful day one.

> ### ⭐ MVP RELEASE LINE — ships at end of Phase 2
> A tester can: upload a resume → get a structured profile → track applications → get a truthful tailored resume + ATS gap → chat *company-and-role-specific* prep with visible provenance → log interview notes and watch the prep space get smarter. **This is the minimum that's recognizably the product we plan to sell.** Everything above this line is required for MVP; everything below is post-MVP.

### Phase 3 — Trust, polish & launch-readiness (P1, finish before/at the 10–20 tester launch)
- **Confidence feature** — per-scope confidence driven by *independent corroboration* (not raw volume), always paired with a source label (PROJECT.md §6).
- **Onboarding + empty/loading/error state audit** across every new AI surface.
- **Landing honesty fix** — remove the "2.4×" claim; use mechanism-based copy.
- **Privacy / DPDPA** — deletion-on-request, purpose limitation, privacy controls surfaced in Settings.
- **Observability** — PostHog (product analytics) + Sentry (errors) so tester behavior and failures are visible.
- **Kanban drag-and-drop** on the tracker.

### Phase 4 — Convenience & reach (P2, post-MVP scaling)
- **Job discovery** — pull roles from Greenhouse/Lever/Ashby public JSON + Adzuna; semantically rank against the profile.
- **Speed alerts** — notify when a role posts at a target company (fresh applications get seen more).
- **Activate the user's own network** — surface known contacts at a company, draft a strong referral ask (user sends from their own account). Wire `referral_contacts`. LinkedIn search URL now uses catalog role titles + `currentCompany` when org id is seeded ([PROJECT.md §16](PROJECT.md#16-catalog-first-company--role--level-built)); drafts remain mock.
- **Browser extension** — autofill in the user's own session; human reviews and submits (Plasmo / Manifest V3).

### Phase 5 — Premium & moat-deepening (P3, monetization + scale)
- **Mock interview** — AI interviewer grounded in the company context.
- **Evaluation engine** — rubric-based answer scoring (flagship premium).
- **Practice library** — profession-adaptive drills.
- **Payments** — Razorpay.
- **Cross-user corpus flywheel** — cluster early users by city/industry/company so debriefs overlap; the corpus that survives churn (PROJECT.md §2).
- **Hardening for scale** — multi-tenant review, tests, CI, bundle splitting.

---

## Part D — Strategic fork to decide (doesn't block building)
PROJECT.md §12 leaves one question open: **personal/portfolio tool vs. real multi-user business.** The plan above is built so you don't have to answer yet — Phases 0–3 give a genuinely sellable single-user MVP, and the `0007` migration means the cross-user corpus (Phase 5) can turn on later without a rewrite. Recommended default (matches the docs): **start single-user, dogfood on your own switch, harden only if earned.** If it becomes a business, commit to the India wedge or B2B rather than generic B2C.

---

## Suggested build order, condensed

Done, out of order: **Edge Function provider** and **resume parsing**. The rest:

`apply 0006 to the hosted project + deploy the functions + VITE_AI_PROVIDER on Vercel + one real call → 0007 corpus migration → truthful tailoring/ATS → company-prep RAG + compounding loop → [MVP] → confidence + privacy + observability + landing fix → job discovery + alerts + network + extension → mock interview + evals + practice + payments + corpus flywheel`
