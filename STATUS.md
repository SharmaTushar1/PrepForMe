# PrepFor.Me — Where I Am & What's Next

*A clean snapshot as of the latest audit — verified by reading the repo **and** walking the signed-in app. Companion to [BUILD_PLAN.md](BUILD_PLAN.md) (the roadmap) and [SETUP_AND_STACK.md](SETUP_AND_STACK.md) (providers, setup, pricing).*

**Snapshot date:** 5 Aug 2026 · **Git:** local `main` (Phase 3 corpus landed)

---

## The one-line answer

**Résumé half works. Company-prep RAG is built and deployed** (claim-based ingest, multi-turn chat, Save to prep, asymmetric sharing). Schema and all five functions are on hosted; what's left before production chat counts as live is **one real end-to-end pass with `VITE_AI_PROVIDER=edge` on Vercel**.

Prep chat UX fixed 5 Aug: multi-turn history, no more "can't access your index" when claims were retrieved, clickable citations/URLs, Shift+Enter, Save-to-prep from the exchange. See [TECHNICAL.md §8](TECHNICAL.md#8-the-ai-seam).

Source counts fixed 5 Aug: a role now counts company-scope sources from sibling roles (badged `company-wide`) and shared claims from other candidates, so "0 sources · Cold start" no longer appears on a role the coach can already answer. See [TECHNICAL.md §10](TECHNICAL.md#10-gotchas).

```
Phase 0 setup ────▓▓▓▓▓▓  DONE — cap set, resume functions deployed
Phase 1 résumé ───▓▓▓▓▓▓  DONE — analysis, report, rewrites, quota, live
Phase 2 tailoring ▓░░░░░  UI + mechanical keyword gap only
Phase 3 moat/RAG ─▓▓▓▓▓░  code, migration and functions deployed; chat UX fixed locally
Phase 4 polish ───░░░░░░  not started
Phase 5 reach ────░░░░░░  not started
                         ⭐ MVP = Phase 3 live on hosted
```

---

## Verified working in the app (walked it signed-in)

- Profile, résumé report, rewrites, tracker, Home — as before.
- **Company prep UI** — paste / URL / PDF sources, domain confirm, Save to prep, provenance chips, multi-turn chat (Shift+Enter), clickable citation links, company-wide sources and shared-claim count shown per role. Wired to Edge Functions when `VITE_AI_PROVIDER=edge` and functions are served.

## Still mock (UI present, no model behind it)

- **JD tailoring + ATS keyword gap** (mechanical keywords only for the gap).
- **Referral drafts**.

## Doesn't exist yet

Confidence number in UI · Discover job feeds · Practice · browser extension · Sentry / PostHog / Resend · **normalization layer** (§16 in [PROJECT.md](PROJECT.md#16-normalization-backlog-planned-not-started) — level equivalence Mid≈L3, role title cleanup for search, LinkedIn current-employer filter).

## 🔴 Next — close hosted Phase 3

1. ~~Apply `0006` / `0007`~~ **done** (remote history repaired; `0007` pushed).
2. ~~Deploy ingest / prep-chat / save-prep-claims~~ **done**, plus both résumé functions
   redeployed with the `effort` fix.
3. ~~Confirm `OPENAI_API_KEY` (and Anthropic) secrets on hosted~~ **done** — `ANTHROPIC_API_KEY`,
   `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` and `OPENAI_API_KEY` are all set as project secrets.
4. One real paste → index → ask → Save to prep on production (with `VITE_AI_PROVIDER=edge`).

## 🟡 Soon

5. Make JD tailoring real.
6. Fix landing **"2.4×"** claim.
7. Sentry + PostHog before testers.
8. **Normalization** — level ladder (Mid ≈ L3), strip `(FTC)`-style suffixes from role titles, LinkedIn search scoped to *current* employer not keyword-in-bio. Spec: [PROJECT.md §16](PROJECT.md#16-normalization-backlog-planned-not-started).
