# PrepFor.Me — Source of Truth

*The canonical project doc: what it is, how it works, what's decided, and what's next. Kept concise but complete. Supersedes the standalone decision log. Version history at the bottom (major changes only, moving forward).*

**Live:** https://prep-for-me.vercel.app/ (currently a basic CRUD skeleton — build in progress)
**Stage:** pre-v1, targeting 10–20 friends-and-family testers.
**Technical detail:** [TECHNICAL.md](TECHNICAL.md) — stack, schema, hosting, deploy, gotchas.
**Last updated:** 2 Aug 2026

---

## Current state

What exists in the repo today, as distinct from what's planned below.

**Working, persisted, multi-user:** magic-link sign-in; a 14-table Postgres schema with row level security on every table; routed URLs so a refresh lands where you were; profile and settings editing; adding and editing roles; logging recaps with real text; funnel metrics (response rate, interview rate, active applications, interviews this week, prep readiness) all derived from actual rows rather than constants; JSON export and per-application corpus clearing; empty states throughout.

**Deployed and verified:** Vercel, building from GitHub `main`, credentials inlined at build time, deep links served correctly. Supabase project in Mumbai (`ap-south-1`), all three migrations applied, sign-up confirmed end to end — accounts are created and the trigger seeds their `profiles` and `user_settings` rows.

**Not real yet:** every AI surface. There are no model calls — an `AiProvider` interface sits in front of a local implementation that reasons only over the user's own bullets, job description, and recaps. Also absent: resume upload and parsing, Discover's job feeds, Practice, the browser extension, and the referral and tailoring tables (created, policied, unused). Each says so on screen rather than pretending.

**Scale caveat:** single-user-per-account, no test suite, no CI, one 629 kB bundle. Appropriate for 10–20 testers, not beyond.

---

## 1. What it is

A **profession-agnostic** job-search copilot (tech and non-tech). A user uploads a resume, gets a structured profile and role advice, tracks applications, tailors materials truthfully to each job, and — the differentiator — gets **deep, company-and-role-specific interview prep that compounds over time.**

**Positioning:** prep-first, not volume-first. Apply to fewer jobs, better; walk in knowing the company cold. Never overpromises a job or cites false "Nx your chances" multipliers.

**Name/domain:** PrepFor.Me (live). Doesn't block anything.

## 2. The moat (core insight)

The moat is **not** automation (commoditized, legally fraught). It's the **per-application prep space + the debrief loop**, and specifically the **first-party interview data users contribute** — legal, defensible, and it *survives churn* (users leave on success, but their data stays and improves the product for the next person). The compounding and the churn-defense are the same asset.

- **One coach, many dossiers:** one AI model, scoped context per application. Feels like a specialist per company; costs almost nothing extra (stored embeddings + scoped retrieval via metadata filter / pgvector).
- **Three knowledge layers**, composed at query time:
  1. **Company layer** — public first-party info (site, blog, product, news, funding). Shared across roles at that company.
  2. **Role & level layer** — what the interview looks like for that role/level. Also strong at the **interview-type** level (behavioral, system design, case, sales roleplay) — this is where a user's notes compound across companies, since you rarely re-interview at the same company but face the same *format* repeatedly.
  3. **Personal layer** — the user's own interview notes ("debriefs"). Private.
- **Compounding loop:** after each real interview the user logs notes → deepens that prep space. The "gets smarter with use" magic; it's the user's own data → zero ToS/legal risk.
- **UI naming:** plain words — "Company prep" and "Interview notes" (not "dossier"/"debrief" — those are internal metaphors).

## 3. Data sourcing & integrity rules (decided)

- **Seed content:** permissive-licensed (MIT / Apache / CC-BY / CC0) **or** originally generated. **Verify the license at the source, not just the label** — permissive tags on HuggingFace/GitHub are frequently wrong (license may cover packaging, not content).
- **Never ingest** LeetCode, LintCode, Glassdoor, or other paywalled/competitor corpora (copyright + ToS landmine — and unnecessary). Detection risk scales *with success*, so it's a liability exactly when it would start to matter.
- **Coding problems:** describe classic patterns in your own words (patterns aren't ownable); **link out** to sites rather than reproducing their text. Generic textbook problems = fine verbatim; custom/company-specific ones = own words only.
- **Cold-start:** day-one baseline = model's general knowledge + real public company info + user concentration (cluster early users by city/industry/company so debriefs overlap and the flywheel ignites). No scraped corpus needed. Non-tech has *no* clean company-specific open dataset — same play, company-specific layer always starts thin and fills via users.
- **Hard line:** generate general/format material freely; **never present fabricated company-specific facts, even hedged.** "Low confidence" ≠ "we invented this." AI guesses about a specific company must be labeled *"AI-inferred, unconfirmed,"* not dressed as low-confidence intel. Generated content lives in the general layer only.

## 4. Scope

**v1 — build fully**
- Onboarding: resume → parsed **structured profile** (discrete editable fields, not text blobs).
- Profile view/edit + standing strengths/gaps review.
- **Application tracker** (the spine): Saved → Applied → Screen → Interview → Final/Onsite → Offer; + Rejected/Withdrawn; customizable.
- **Resume tailoring:** paste JD → truthful reframe (never fabricates) + ATS keyword-gap analysis. Show what changed and why (transparency = trust). *Lower priority than the differentiator — see §9.*
- **Company prep workspace:** per-application scoped RAG chat with source provenance.
- **Interview notes capture:** quick structured log; visibly strengthens the prep space.

**v2 — convenience & reach**
- Browser extension (autofill in the user's own session; human submits).
- Job discovery: pull roles from public ATS feeds, semantically rank vs profile.

**Later / premium**
- Mock interview (AI interviewer grounded in company context).
- Evaluation engine (rubric-based answer scoring — flagship premium).
- Practice library (profession-adaptive drills).

**Getting-the-interview layer** (build into product): speed alerts on fresh postings; company-specific "why this company" notes; truthful ATS optimization + fit scoring; activate the user's *own* network; personalized consented follow-up (user sends from own account). Referral network = later phase, not v1.

## 5. Out of scope (do not build)

- **Auto-submit applications** (ATS endpoints gated by employer keys; headless automation = brittle + CAPTCHA + ToS breach) → reframe as browser-extension autofill.
- **Scraping recruiters/emails** (LinkedIn ToS bans the user's account; DPDPA/GDPR liability) → use the posting itself + user's own network + consented outreach.
- **False multiplier claims / reach guarantees.**

## 6. Confidence feature (good idea — build it)

Per company/scope confidence level, rising as data accrues (Glassdoor-style). **Driven by independent corroboration, not raw volume** (multiple candidate reports agreeing → high; defends against gaming). **Always paired with a provenance/source label** — "from company site," "from 3 candidate reports," "general pattern," "AI-inferred, unconfirmed." Source is what the user weighs; a bare number isn't honest.

## 7. Tech stack

Vite SPA (React) on **Vercel** + **Supabase** (Postgres + pgvector + Auth + Storage) + LLM (Anthropic/OpenAI behind one swappable `generate()` interface; default cheap tier, premium only for prep chat) + OpenAI `text-embedding-3-small` + **Upstash** (jobs/queue) + **Resend** (email) + **Sentry** + **PostHog** + GitHub. Job postings via Greenhouse/Lever/Ashby public JSON + Adzuna. Extension via Plasmo/Manifest V3. Payments later: Razorpay.

**Critical build rules:** LLM calls **server-side only** (never key in frontend); set a **hard spend cap + billing alert ($20–30)** before any real call; keep the LLM behind one swappable interface.

**Supabase settings:** Region Mumbai (ap-south-1, permanent); Data API ON; auto-expose new tables OFF; **automatic RLS ON** (app holds resumes + interview notes → every table locked to "users see only their own rows").

**Consequence of "auto-expose OFF" (learned the hard way):** since 2026-05-30 Supabase does not grant new tables to the Data API roles, so **every migration that creates a table must also grant it** to `authenticated`, or every request returns `42501 permission denied` with policies that look perfectly correct. Grants are checked before RLS, so the error mentions nothing about policies. Pattern lives in `supabase/migrations/0003_grants.sql`; full explanation in [TECHNICAL.md §7](TECHNICAL.md#7-migrations-and-the-grants-rule).

Implementation detail for everything in this section — versions, project refs, env vars, deploy pipeline — lives in [TECHNICAL.md](TECHNICAL.md). Of the stack above, only Vite, React, Supabase, and Vercel are actually in use today; pgvector, Upstash, Resend, Sentry, PostHog, and the LLM providers are planned, not installed.

## 8. Cost (month 1, 10–20 testers)

Mostly free tiers; only LLM scales with use. One-time: domain + Chrome Web Store $5. LLM on cheap tier ≈ ₹200 total for 20 users; on premium-for-everything ≈ ₹4,400 (~20x gap). **Under ₹6,000/month** if prep chat defaults to a mini model + spend cap is set.

## 9. Strategic read (context for decisions)

- Demand is real and people pay, but the category is **saturated** and job-seeker B2C **churns by design** (success = they leave → low LTV).
- **Strongest as a portfolio + personal tool** for the founder's own job switch (dogfoods, demonstrates RAG/full-stack/eval skill). **As a business, only via a wedge:** India-specific (US tools are Greenhouse/ATS-centric; India underserved) *or* B2B (bootcamps/universities/outplacement — buyer isn't the churner).
- Durable value = the un-sexy differentiated infrastructure (debrief-fed corpus, evals), not flashy automation. Build the prep spine first.
- **Goal stated:** ~$10K/mo MRR eventually. Churn-tolerant, but that requires a cheap repeatable acquisition channel (MRR leaks as fast as it enters). Deferred until there are users.

## 10. Design / UX principles

Prep over volume; truthful by design; human always acts (never auto-submits/sends/scrapes); make compounding *felt* ("prep space levels up"); calm-under-pressure tone (war room / coach's notebook, not cheerful startup or cold enterprise); one coach many dossiers; provenance = trust (show where prep came from); every screen has empty/loading/populated/error states; **avoid generic-AI defaults** (esp. cream + serif + terracotta). Application detail screen = the heart (materials + company prep + interview notes per role).

## 11. Legal / non-functional

- **Single-user first** (one candidate per account); harden to multi-tenant only if earned.
- **DPDPA (India):** holds sensitive career data + PII → encryption, purpose limitation, deletion-on-request, prominent privacy controls; RLS enforces per-user isolation.
- Company corpus = **first-party sources only** (their site/news + user's own notes).
- **Founder's own debriefs** = ideal seed fuel. Tag as "1 candidate report (founder)" (no inflated confidence). No NDA signed → cleared main hurdle; still filter each specific problem: *was I asked not to share it?* / *generic or their custom problem?* Describe custom ones in own words; lean to process shape over verbatim questions.
- **Caveat:** the legal-adjacent calls here (NDA/confidentiality, license verification) are a **risk map, not legal advice.** Fine at v1 scale; get a real opinion before scaling. Don't let "we settled it" harden into "definitely fine at scale."

## 12. Open questions

- Portfolio/personal tool vs. real multi-user product? (Recommended: start single-user, dogfood, harden only if earned.)
- If a business: commit to India wedge or B2B, not generic B2C.
- Acquisition channel for the $10K MRR goal (deferred).

## 13. Next build step

**Scope data model first:** `(company, role, level, interview-type)` as the key, with a **provenance tag** and **corroboration count** on every piece of content from day one — the confidence feature depends on this being in the schema, not bolted on later.

**Gap to close:** none of that exists yet. The prep tables shipped so far — `prep_sources`, `prep_messages`, `tailorings`, `tailoring_changes`, `ats_keywords` — are keyed by `application_id` and `user_id` only. There is no `(company, role, level, interview_type)` content key, no provenance tag, no corroboration count, and no pgvector column anywhere. `prep_messages.citations` (jsonb) is the only provenance hook in the schema today. Everything currently stored is single-user and private, so nothing yet feeds the cross-user corpus that §2 describes as the moat. This is the migration to design before building more prep UI.

---

## Version history

*Major changes only, going forward.*

- **2 Aug 2026 — CRUD skeleton shipped and deployed.** Replaced the hardcoded prototype with a real backend: Supabase Postgres schema across 14 tables with RLS on every one, magic-link auth with a session guard, React Router URLs, a TanStack Query data layer, real form inputs that persist, metrics derived from actual rows, and an `AiProvider` seam with a local implementation. First deploy to Vercel at prep-for-me.vercel.app. Discovered and fixed the Supabase Data API grant change (`0003_grants.sql`). No AI, resume parsing, or job feeds yet.
- **2 Aug 2026 — baseline.** Source-of-truth doc established. Captures project definition, tech stack, scope, and the settled data-sourcing/integrity/confidence/founder-debrief decisions from the strategy session. No build work started beyond the CRUD skeleton.
