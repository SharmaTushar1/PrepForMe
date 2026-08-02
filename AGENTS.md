# Agent instructions

## Read first

- [PROJECT.md](PROJECT.md) — the source of truth: what this product is, what's decided,
  what's deliberately out of scope, and what's next. Read it before proposing features.
- [TECHNICAL.md](TECHNICAL.md) — stack, schema, hosting, deploy, and the gotchas that
  have already cost time. Read it before touching data access, migrations, or config.

## Keep the docs current

Both files are maintained, not archived. As part of the same change — not as a follow-up:

- **`PROJECT.md`** — update the **Current state** section whenever what's real changes: a
  surface goes from placeholder to working, a table gets wired up, a scale caveat stops
  being true. Add a **Version history** entry for anything major (a milestone shipped, a
  reversed decision, a new integration), newest first, dated. Update **§13 Next build
  step** when the gap it describes closes or moves. Bump **Last updated**.
- **`TECHNICAL.md`** — update on any change to the stack, dependencies, schema, hosting,
  environment variables, or build and deploy setup. If something cost you an hour of
  confusion, add it to **§10 Gotchas** so it costs the next session nothing. Bump
  **Last updated**.
- Don't duplicate detail between the two. Strategy and status in `PROJECT.md`,
  implementation in `TECHNICAL.md`, a short front page in `README.md` that links both.

Skip doc updates only for changes that alter nothing a reader would act on — a typo fix,
a rename with no behavioural change.

## Invariants

Breaking these has bitten this project before. See `TECHNICAL.md` for the reasoning.

- **Every migration that creates a table must also grant it** to `authenticated`.
  Supabase no longer does this automatically; without the grant every request fails with
  `42501` while the policies look correct.
- **Never edit an applied migration.** Add a new numbered file.
- **Enable RLS with a `user_id = auth.uid()` policy on every new table.** The app holds
  resumes and interview notes; there is no server-side authorization layer besides RLS.
- **Components never call `supabase` directly.** Queries and mutations live in
  `src/data/`, behind a hook, keyed via `queryKeys.ts` and namespaced by user id.
- **State has three homes and they don't overlap:** server data in TanStack Query,
  navigation state in the URL, ephemeral UI state in `store.tsx`.
- **No secret ever gets a `VITE_` prefix.** Those are inlined into the client bundle. LLM
  calls go through a Supabase Edge Function.
- **AI surfaces go through the `AiProvider` interface** in `src/lib/ai/`, never a direct
  model call from a component.
- **Never present fabricated company-specific facts**, even hedged. Label inferences
  "AI-inferred, unconfirmed." See `PROJECT.md` §3.

## Conventions

- TypeScript strict; fix all `npm run build` errors before finishing.
- Comments explain intent or a constraint the code can't show — never narrate the code.
- Match the surrounding style: this codebase uses inline style strings via `src/css.ts`,
  not a UI framework or CSS modules.
- Every screen needs empty, loading, populated, and error states.
- Unbuilt features say so on screen rather than showing fake data.
