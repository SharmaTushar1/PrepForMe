# PrepFor.Me · Job Copilot

A working implementation of the **Job Copilot** product design — a "war room" for
high-intent job applications. PrepFor.Me tailors your resume truthfully to each
role, builds deep company-specific interview prep that compounds with every recap,
and keeps the human in charge (nothing is ever auto-submitted).

This is a single-page React app implemented from the design component
`Job Copilot.dc.html`, reproducing every screen, state, and interaction.

## Stack

- **React 18** + **TypeScript**, built with **Vite**.
- No UI framework — the design's styling is reproduced exactly. Inline style
  strings from the design are parsed 1:1 into React style objects by the small
  helper in [`src/css.ts`](src/css.ts), so colors (oklch), gradients, and layout
  match the source pixel-for-pixel.
- Fonts: Space Grotesk, IBM Plex Sans, IBM Plex Mono (loaded in `index.html`).

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

## What's implemented

**Marketing site (`landing`)** — sticky nav, hero with an auto-rotating 4-step
product demo, trust strip, how-it-works, feature cards, the dark "company dossier"
signature band, reviews, pricing, privacy band, and CTA.

**Onboarding** — a 3-step flow (upload → parsing → structured review) with a
progress indicator and simulated parsing delay.

**The app shell** with a sidebar and these views:

- **Home** — readiness metrics, "needs attention" queue, and the deepest prep space.
- **Applications** — a kanban **Board** and a dense **Table**, with honest funnel
  analytics.
- **Application detail** — a stage pipeline plus four tabs:
  - _Materials_ — the truthful tailoring diff and ATS keyword-gap view (with a
    re-tailor spinner).
  - _Referrals_ — per-person draft notes, LinkedIn launcher, and invite settings
    (Premium toggle + character-limit stepper that live-validates each draft).
  - _Company prep_ — a briefing-room chat grounded in layered sources, with a
    prep-depth indicator that levels up as you log recaps, and a room switcher.
  - _Recaps_ — logged interview debriefs.
- **Debrief capture** — log a recap; on save the prep space "levels up".
- **Profile**, **Discover** (v2 preview), **Practice** (locked/Premium), **Settings**.

**Overlays** — a guided **product tour** with a moving spotlight (17 steps that
drive you through the whole app), the browser-extension popup, and a contact modal.

## Architecture

| Path | Responsibility |
| --- | --- |
| [`src/store.tsx`](src/store.tsx) | Single React context holding all app state, action handlers, and shared derivations (a faithful port of the design's `DCLogic` class + `renderVals()`). |
| [`src/data.ts`](src/data.ts) | Seed data: applications, stages, the 17 tour steps, and the color/logo palettes. |
| [`src/css.ts`](src/css.ts) | `css("…")` — parses a CSS declaration string into a React style object (memoized). |
| [`src/components/`](src/components) | One component per screen/overlay. |

State is deliberately in-memory (this mirrors the design prototype); refreshing the
page resets to the seed data. The product tour remembers that you've seen it via
`localStorage`.
