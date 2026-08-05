# PrepFor.Me — Stack, Providers & Setup Order (with pricing)

*Execution companion to [BUILD_PLAN.md](BUILD_PLAN.md). That file says what to build and in what order; this one says which service to use for each need, where to sign up, and what it costs. Pricing verified August 2026 — re-check at signup, tiers move.*

**Created:** 3 Aug 2026 · **Updated:** 4 Aug 2026

---

## 0. TL;DR

- Your old stack list from the earlier chat is **still 90% right**. One thing reality changed: you built on **Vite, not Next.js** — keep it, don't migrate. "Backend/API" is served by **Supabase Edge Functions**, not Next API routes.
- **You've already done most of the "core" tier** — GitHub, Vite+React, Vercel, Supabase, domain. Since 4 Aug the first Edge Function and the resume Storage bucket exist too. What's missing is embeddings and ingestion, plus ops (Sentry/PostHog/Resend) and the extension.
- **LLM provider: use Anthropic (Claude) for generation + OpenAI for embeddings.** Sign up at `console.anthropic.com` and `platform.openai.com` — these are the *developer API consoles*, not the consumer Claude/ChatGPT subscriptions. The Anthropic account exists, its key is in `supabase/.env.local`, and the resume analyzer now works against it; **the spend cap in §4 is still not set, and the API has already been billed without it.**
- **Month-1 cost for 10–20 testers ≈ $5–10 (₹450–900), often less.** Everything is free-tier except a few dollars of LLM/embedding usage. The only real bill is the LLM, and it has started: `VITE_AI_PROVIDER` still defaults to a local provider that returns a labelled sample, but `.env.development.local` sets it to `edge`, so `npm run dev` on this machine talks to the real analyzer against an uncapped account. **Spend to date is roughly $0.20 — three analyses on 4 Aug, of which one produced a report and one was billed for nothing** (see [TECHNICAL.md §8](TECHNICAL.md#8-the-ai-seam)). Trivial as money, useful as evidence: the guards in the code bound accidents, not bills.

---

## 1. What you've already done (from your repo — don't redo these)

| Need | Service | Status in your repo |
| --- | --- | --- |
| Code / VCS | **GitHub** | ✅ Done (`main`, two commits) |
| Frontend | **Vite + React 18 + TS** | ✅ Done |
| Hosting | **Vercel** | ✅ Done — deployed at prep-for-me.vercel.app, SPA rewrite in `vercel.json` |
| DB + Auth + Storage | **Supabase** (Mumbai) | ✅ Done — 18-table schema with RLS on every table, magic-link auth. All 5 migrations now applied to the hosted project (`0004`/`0005` on 5 Aug, after "bucket not found" on the live site), verified equal to local |
| Vector store | **pgvector** | ⚠️ Available in Supabase but **not enabled/used yet** — no embedding column exists |
| File storage | **Supabase Storage** | ✅ Done — private `resumes` bucket, 10 MB, PDF only, per-user path policies (`0004`), on **both** local and hosted; upload/insert/read proven against the live project |
| Backend / API | **Supabase Edge Functions** | ⚠️ `analyze-resume` works end to end locally — streams progress, returns a real report — but is **not deployed** |
| Domain | **prepfor.me** | ✅ Owned |

So core infra tiers 1–9 from your old list are essentially **already handled**. The work ahead is turning the AI layer on, then embeddings, then ops.

### Auth redirect URLs live on the hosted project, not in git

`supabase/config.toml` configures **only the local stack**. Its `site_url = "http://localhost:5173"` is correct there and must stay. The hosted project has its own copy of those settings, editable in the dashboard under *Authentication → URL Configuration* or via the Management API, and **nothing in this repo keeps the two in sync.**

That bit us on 5 Aug: the hosted project still carried `site_url = http://localhost:5173` with only localhost allow-listed, so magic links sent from the live site pointed at localhost. The cause is worth understanding, because the client code was never wrong — `Login.tsx` sends `emailRedirectTo: ${window.location.origin}/app`, which on Vercel is the right URL. **GoTrue silently discards an `emailRedirectTo` that isn't on the allow list and falls back to Site URL**, so a missing allow-list entry looks exactly like a hardcoded localhost bug.

The hosted project is now:

```
site_url       = https://prep-for-me.vercel.app
uri_allow_list = https://prep-for-me.vercel.app/**,
                 https://prep-for-me-*.vercel.app/**,   # preview deployments
                 http://localhost:5173/**,              # vite dev, if ever pointed at hosted
                 http://localhost:4173/**               # vite preview
```

Localhost stays on the allow list but is **no longer the fallback**, which is the part that matters: an unrecognised origin now lands on production rather than on a machine that isn't running. Two follow-ons: `supabase config push` would overwrite these with config.toml's localhost values, so **don't run it against this project** without making the URLs environment-aware first; and if a custom domain (`prepfor.me`) is ever pointed at Vercel, both `site_url` and the allow list need it added or the same failure returns.

## 2. The one change since that old list: Vite, not Next.js

Your old recommendation said Next.js + Next API routes. You shipped a **Vite React SPA + Supabase** instead — and that's a fine, arguably better fit here: an SPA talking directly to Supabase with RLS as the auth boundary is simpler than running a Next server. **Don't migrate.** The "backend / API" box in the old list is filled by **Supabase Edge Functions** (Deno), which is also exactly where the LLM key must live (server-side, never in the browser bundle). Everything else in the old list stands.

## 3. Provider picks (updated) — and where to sign up

| # | Need | Use | Sign up at | Backup | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Code / VCS | GitHub | github.com | GitLab | ✅ have |
| 2 | Frontend | Vite + React | — | — | ✅ have |
| 3 | Hosting | Vercel | vercel.com | Netlify | ✅ have |
| 4 | Backend / API | **Supabase Edge Functions** | (in Supabase) | small Node svc on Railway | ⚠️ written, served locally, not deployed |
| 5 | DB (Postgres) | Supabase | supabase.com | Neon | ✅ have |
| 6 | Vector store | pgvector (in Supabase) | (extension) | — | ⬜ enable |
| 7 | Auth | Supabase Auth | (in Supabase) | Clerk | ✅ have |
| 8 | File storage | Supabase Storage | (in Supabase) | Cloudflare R2 | ✅ bucket wired |
| 9 | Domain / DNS | Cloudflare / your registrar | cloudflare.com | Namecheap | ✅ have |
| 10 | **LLM** (chat, tailoring, prep) | **Anthropic Claude** | **console.anthropic.com** | OpenAI | ✅ working — 6 analyses + 3 rewrites on 4 Aug, ~$0.45, two real reports at ~$0.09 and ~$0.10 |
| 11 | **Embeddings** | **OpenAI text-embedding-3-small** | **platform.openai.com** | Voyage AI | ⬜ **set up** |
| 12 | Background jobs / queue | Upstash (QStash + Redis) | upstash.com | Supabase cron | ⬜ later (v2 ingestion/alerts) |
| 13 | Company-page fetching | DIY fetch + Readability/Cheerio | (npm) | Firecrawl (paid) | ⬜ Phase 2 |
| 14 | Job postings | Greenhouse + Lever + Ashby public JSON | (no auth) | — | ⬜ v2 |
| 15 | Broader job coverage | Adzuna API (free tier) | developer.adzuna.com | JSearch (RapidAPI) | ⬜ v2 |
| 16 | Error monitoring | Sentry | sentry.io | — | ⬜ Phase 3 |
| 17 | Product analytics | PostHog | posthog.com | — | ⬜ Phase 3 |
| 18 | Transactional email | Resend | resend.com | Postmark | ⬜ when you send email |
| 19 | LLM spend cap | Anthropic/OpenAI dashboard | (in those) | — | ⬜ **still not set — and the account has now been billed without it; see §4** |
| 20 | Secrets / env | Vercel env + Supabase secrets | (in those) | — | partial — the Anthropic key is local only; nothing set as a Supabase secret yet |
| 21 | Extension framework | Plasmo (or plain MV3) | plasmo.com | — | ⬜ v2 |
| 22 | Extension publishing | Chrome Web Store ($5 once) | chrome.google.com/webstore/devconsole | — | ⬜ v2 |
| 23 | Payments (later) | Razorpay (India) | razorpay.com | Stripe | ⬜ when charging |

## 4. The LLM question, answered specifically

**"Pick a provider — but from where, and what?"**

- **Generation (the coach: prep chat, tailoring, resume parsing): Anthropic Claude.** Sign up for API access at **`console.anthropic.com`** (this is the developer console — separate from a personal Claude.ai subscription; you pay per token, not a monthly seat). Default model for text work: **Claude Haiku 4.5** ($1 / $5 per million input/output tokens), routing the premium prep chat to something bigger later only if quality demands it. Haiku is the cheapest current-gen model and is plenty for tailoring and most prep.

  **One exception, already in the code:** the resume analyzer defaults to **`claude-sonnet-5`**, not Haiku. It sends the PDF as a `document` block, so the model is looking at page images as well as text and is being asked to judge layout — two-column reading order, tables, contact details stranded in a header. That is the half of an ATS review Haiku is least suited to. It runs once per explicit "Analyze resume" press rather than per message — and not on upload, which stores the file and reads nothing — at roughly **$0.03–0.05 for a two-page resume**, so the cost of the choice is small and bounded. Override it with the `ANTHROPIC_MODEL` environment variable on the function if you want to test that assumption.

  **Measured, and the estimate was low.** A successful one-page analysis on 4 Aug cost **$0.09** — 8,516 input tokens at $2/MTok and 6,990 output at $10/MTok (introductory rates; $3/$15 from 1 Sep, so the same run becomes ~$0.13). A later run with the fuller parse cost **$0.10** on 10,151 in / 8,216 out, so the parse sections are worth about a cent. Sonnet 5 thinks by default and thinking is billed as output, so **over half of that is reasoning nobody reads.** Budget $0.10–0.15 per analysis, not $0.03–0.05. The analyzer runs at `medium` effort with a three-finding ceiling per category for exactly this reason; `ANTHROPIC_EFFORT=low` is the next dial if the report doesn't justify its bill.
- **Embeddings (for the RAG vector search): OpenAI `text-embedding-3-small`.** Sign up at **`platform.openai.com`**. It's ~$0.02 per million tokens — effectively free at your scale — and is the standard pairing with pgvector. Anthropic doesn't offer a first-party embeddings endpoint, which is why generation and embeddings come from two vendors. That's normal and the code already treats the AI layer as swappable.

So: **two developer accounts — Anthropic (generation) and OpenAI (embeddings only).** If you'd rather have *one* vendor and one bill while validating, use **OpenAI for both** (a mini chat model + embeddings) — slightly simpler ops, marginally less "coach" polish. Either is fine; the `AiProvider` seam means switching later is a config change.

**Cost-control rules (do these the moment each account exists, before any real call):**
1. Set a **hard monthly spend cap + billing alert ($20–30)** on both the Anthropic and OpenAI dashboards. **Not done on Anthropic, and the analyzer is now a working feature billing against it.** This is the safety belt, and the order it was meant to go on in has now slipped past the event it was meant to precede — put it on before the next run, not after a retry loop drains the account.
2. Turn on **prompt caching** for the company-context portion of prep chat (cuts cached input ~90%) and use the **Batch API** for bulk embedding a corpus (50% off). These two levers are most of the difference between a $5 month and a $50 month.
3. Keep both keys **only** in Supabase Edge Function secrets — never in a `VITE_` var (those get inlined into the browser bundle). The Anthropic key currently lives in `supabase/.env.local`, which is what `supabase functions serve --env-file` reads; every `.env` file in the repo is gitignored at every depth, `.env.example` excepted.

**The code already carries its own guards** — provider selection that defaults to spending nothing (local dev has opted out of that default), an analysis that only ever runs on an explicit press, a per-user daily ceiling, an in-flight lock, and page and size limits, all detailed in [TECHNICAL.md §8](TECHNICAL.md#8-the-ai-seam). They bound a bug, and not even completely: the daily ceiling counts *saved* reports, so a call that Anthropic bills and validation then rejects never moves the counter, and an analysis that keeps failing can bill past ten a day. Fixing that properly needs an attempts ledger and a migration, and it hasn't been done. So they don't bound a bill — as the billed failure on 4 Aug demonstrated, which the daily counter never saw. The cap is still the only thing that bounds a bill, and it is still not set.

## 5. Step-by-step: everything to do, in order

Infra setup and the build phases from BUILD_PLAN.md, merged into one sequence. Work straight down.

**Phase 0 — turn the AI layer on (setup)**
1. ~~Create an **Anthropic** account at console.anthropic.com → generate an API key~~ → **set the $20–30 spend cap + alert.** The account and key exist; the cap does not, and the account has now been billed without it. Discipline was the only thing holding the order, and the order has already been broken.
2. Create an **OpenAI** account at platform.openai.com → generate an API key → **set the spend cap + alert**. Only needed at Phase 3 (embeddings) — no rush, but the cap rule is the same.
3. In Supabase, **enable the `pgvector` extension**. ~~Add a resume Storage bucket~~ — done, in `0004`.
4. ~~Build the first **Supabase Edge Function** that wraps Claude behind the existing `AiProvider` interface.~~ Done: `analyze-resume`, with `src/lib/ai/edge.ts` as the real provider and `mock.ts` still the default everywhere except local dev, which sets `VITE_AI_PROVIDER=edge` and reaches the function via `supabase functions serve --env-file supabase/.env.local`. **Still to do:** apply `0004` to the hosted project (it is applied on the local stack), `supabase functions deploy analyze-resume`, and `supabase secrets set ANTHROPIC_API_KEY` — the key is only on the local machine today.
5. Write migration **`0006`**: the `(company, role, level, interview_type)` content key + `provenance` tag + `corroboration_count` + a `vector` embedding column (BUILD_PLAN Part B / PROJECT.md §13 — do this *before* more prep UI). *Renumbered twice: `0004` went to the base resume and `0005` to the rewrite tables.*

**Phase 1 — resume parsing (first real surface)**
6. ~~Wire `parseResume` through the Edge Function + resume bucket so onboarding actually produces a structured profile.~~ Built: upload → private bucket → a second, explicit "Analyze resume" press → one Claude call returning an ATS report and a structured parse → item-by-item review before anything reaches the profile. **What's left is the proof:** set the cap and make the first real call. The flip is already done in local development, which is the wrong order again — the cap was meant to come first. Deployed builds still run on a labelled sample.

**Phase 2 — truthful tailoring**
7. Replace mock `tailorResume` + `atsGap` with real Claude calls; persist to the existing `tailorings` / `tailoring_changes` / `ats_keywords` tables (wire the dead tables). Keep the "show what changed and why" transparency.

**Phase 3 — the moat: company-prep RAG + compounding loop**
8. Company-info ingestion (DIY fetch + Readability) → embed with OpenAI → store in pgvector.
9. Scoped retrieval by `(company, role, level, interview_type)` → real prep chat with **provenance on every answer**; never present fabricated company-specific facts.
10. Feed logged interview notes back into the prep space and make it *visibly* deepen ("prep space levels up").

> ### ⭐ MVP RELEASE — after step 10
> Resume in → profile → tracker → truthful tailoring + ATS gap → company-specific prep chat with provenance → notes that deepen it. This is the sellable minimum. Everything below is post-MVP.

**Phase 4 — trust & launch polish**
11. Confidence feature (corroboration-driven + source label). 12. Empty/loading/error audit on new AI surfaces. 13. **Fix the landing page "2.4×" claim** (violates your own no-false-multiplier rule). 14. DPDPA: deletion-on-request + privacy controls in Settings. 15. Add **Sentry** + **PostHog**. 16. Kanban drag-and-drop.

**Phase 5 — reach & premium (post-MVP scaling)**
17. Job discovery (Greenhouse/Lever/Ashby + Adzuna) + semantic ranking. 18. Speed alerts (needs **Upstash** + **Resend**). 19. Own-network referral activation. 20. Browser extension (**Plasmo**, publish via **Chrome Web Store $5**). 21. Mock interview + evaluation engine + practice library. 22. **Razorpay** payments. 23. Cross-user corpus flywheel + multi-tenant hardening + tests/CI.

## 6. Pricing estimate (verified August 2026)

Exchange rate assumed ≈ ₹87/$ (approximate).

### Month 1 — 10–20 free testers

| Item | Plan | Monthly cost |
| --- | --- | --- |
| GitHub | Free | $0 |
| Vercel | Hobby | $0 *(non-commercial only — see gotcha below)* |
| Supabase | Free | $0 *(project pauses after ~1 week idle; 500 MB DB, 50k MAU, 500k edge-fn calls)* |
| Upstash / Resend / Sentry / PostHog | Free tiers | $0 |
| Domain (prepfor.me) | already owned | ~$0 now *(~₹1.5–3k/yr at renewal)* |
| **Claude API** (Haiku default; Sonnet for resume analysis) | usage | **~$3–6** |
| ↳ of which resume analysis | ~$0.04 × a few analyses each | **~$1–2** |
| **OpenAI embeddings** (3-small) | usage | **<$0.20** |
| Chrome Web Store | one-time | $5 *(only when you ship the extension — that's v2, not month 1)* |
| **Total (month 1)** | | **≈ $5–10 (₹450–900), usually less** |

The LLM is the only bill that scales with use, and Haiku + prompt caching keeps it in single digits at tester scale. Resume analysis is the one Sonnet call, but it fires once per explicit press rather than per message, and the function's own ceiling is ten *saved* analyses per user per day — billed-then-failed calls don't count against it, so treat it as a bound on a runaway client rather than on the bill. This lines up with PROJECT.md §8's "under ₹6,000/month" — you'll likely be an order of magnitude under that. Month 1 as it actually stands is **$0**, because nothing has called the API yet.

### The Vercel commercial gotcha
Vercel **Hobby is personal / non-commercial use only**. Free testers are fine, but the moment PrepFor.Me generates revenue (even ₹1), Vercel's terms require **Pro at $20/seat/month** regardless of usage. Budget for that at the point you start charging, not before.

### At scale (once charging — rough, say 200–1,000 users)

| Item | Rough monthly |
| --- | --- |
| Vercel Pro | $20 |
| Supabase Pro | $25 + usage |
| Resend (paid, once >~3k emails) | ~$20 |
| Sentry / PostHog | often still free → low |
| **LLM + embeddings** | **the big variable — $50 to $500+** depending on model tier and prep-chat volume |
| Razorpay | ~2% per transaction |
| **Fixed floor** | **≈ $65/mo + LLM usage** |

At scale the LLM dominates everything else combined — which is exactly why the model stays swappable and why prep chat defaults to the cheap tier.

## 7. Verify at signup (things that drift)
Free-tier limits and per-token prices change; confirm each on the provider's own pricing page when you create the account. The figures above are August 2026. The two that matter most to watch: **the LLM per-token rate** (your only real variable cost) and **Vercel's commercial-use clause** (a step-change the day you charge).

---

*Sources for pricing: Anthropic, OpenAI, Supabase, Vercel, and Chrome Web Store pricing pages / 2026 references — see chat for links.*
