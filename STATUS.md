# PrepFor.Me — Where I Am & What's Next

*A clean snapshot as of the latest audit — verified by reading the repo **and** walking the signed-in app. Companion to [BUILD_PLAN.md](BUILD_PLAN.md) (the roadmap) and [SETUP_AND_STACK.md](SETUP_AND_STACK.md) (providers, setup, pricing).*

**Snapshot date:** 5 Aug 2026 · **Git:** local `main` (catalog + Phase 3)

---

## The one-line answer

**Résumé + templates work. Company-prep RAG is built and deployed.** Catalog (`0008`), resume templates (`0009`), tailor allowance (`0010`), and profile sections (`0011`) on hosted. Generate/Tailor PDF via Chromium; `tailor-resume` Edge Function with full spine + weighting. What's left for live MVP is **edge provider on Vercel + deploy `tailor-resume` if not yet**.

```
Phase 0 setup ────▓▓▓▓▓▓  DONE — cap set, resume functions deployed
Phase 1 résumé ───▓▓▓▓▓▓  DONE — analysis, report, rewrites, quota, live
Phase 2 tailoring ▓▓▓▓░░  tailor-resume + templates + fidelity; gap still mechanical in mock
Phase 3 moat/RAG ─▓▓▓▓▓▓  corpus + catalog keys; chat UX fixed
Phase 4 polish ───░░░░░░  not started
Phase 5 reach ────░░░░░░  not started
                         ⭐ MVP = Phase 3 live on hosted
```

---

## Verified working in the app (walked it signed-in)

- Profile, résumé report, rewrites, tracker, Home — as before.
- **Company prep UI** — paste / URL / PDF sources, domain confirm, Save to prep, provenance chips, multi-turn chat, company-wide sources / shared claims.
- **Add role** — catalog typeahead for company/role, generic level ladder, specialty + employment type, Custom + request.
- **Generate / Tailor PDF** — Classic/Compact templates, Chromium PDF, skill-gap briefs, fidelity gate.

## Still mock (UI present, no model behind it)

- **ATS keyword gap** (mechanical keywords). Tailor fields + PDF are real when `VITE_AI_PROVIDER=edge`.
- **Referral drafts** (search URL is real; drafts still mock).

## Doesn't exist yet

Confidence number in UI · Discover job feeds · Practice · browser extension · Sentry / PostHog / Resend · catalog merge-votes · full LinkedIn org-id coverage.

---

## 🔴 Next — close hosted Phase 3

1. Apply `0008_catalog.sql` on hosted if missing; redeploy Vercel with `VITE_AI_PROVIDER=edge`.
2. One real paste → index → ask → Save to prep on production.

## 🟡 Soon

3. Make JD tailoring real.
4. Fix landing **"2.4×"** claim.
5. Sentry + PostHog before testers.
6. Grow catalog from `catalog_requests`; fill more `linkedin_company_id` values.
