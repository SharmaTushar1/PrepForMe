# Phase 3 spec — Company prep RAG (the moat)

*A build spec to hand to Cursor. Read [PROJECT.md](PROJECT.md) §2, §3, §6, §13 and [TECHNICAL.md](TECHNICAL.md) §6–§8 first; this file assumes their invariants and does not repeat them.*

**Goal:** make `answerPrepQuestion` real — per-application prep chat, scoped by `(company, role, level, interview_type)`, with provenance on every answer, that deepens as the user logs recaps.

**Decided stack for this phase:** OpenAI `text-embedding-3-small` (1536 dims) for embeddings, Claude Haiku for generation, pgvector columns in our own tables. **Not** Vector Buckets — the corpus is thousands of chunks, not millions, and RLS on our own tables is the entire security model.

---

## 0. The architectural decision that matters most

Read this before writing any SQL.

**Today every prep table is keyed `user_id` + `application_id` — i.e. wholly private.** PROJECT.md §13 names this exact gap: *"nothing yet feeds the cross-user corpus that §2 describes as the moat."* If Phase 3 just bolts a vector column onto `prep_sources`, the moat is structurally impossible — every user re-fetches the same Stripe pages into their own private silo and nobody's notes ever help anybody.

So the new chunk table stores **all three knowledge layers in one table, distinguished by ownership**:

| Layer | `user_id` | `company` | Written by | Visible to |
| --- | --- | --- | --- | --- |
| **Company** — first-party public info | `NULL` | set | ingest function (service role) | all authenticated users |
| **Role / level / interview-type** — general patterns | `NULL` | `NULL` | ingest / seed | all authenticated users |
| **Personal** — the user's own recaps | set | set | owner | **owner only** |

One table, one vector index, one query — the three layers compose at query time exactly as §2 describes. `user_id IS NULL` means shared; `user_id = <uuid>` means private. This single nullable column is what makes the flywheel possible, and it is the thing that is expensive to retrofit later.

---

## 1. Migration `0007_prep_corpus.sql`

Next free number — `0004`/`0005`/`0006` are résumé, résumé edits, and AI quota. **Treat applied migrations as immutable**; this is a new file.

### 1.1 Extension

```sql
create extension if not exists vector with schema extensions;
```

### 1.2 Table `public.prep_chunks`

Columns, with the reasoning that must survive into comments:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid references auth.users (id) on delete cascade` — **nullable, and no `default auth.uid()`**. Null = shared corpus. This deliberately breaks the pattern every other table follows, so comment it loudly or someone will "fix" it.
- **The content key** — all nullable, because a chunk may be general:
  - `company text` — store **normalised** (lowercased, trimmed, legal suffixes stripped). Matching is on this, so `Stripe`/`stripe`/`Stripe, Inc.` must collapse to one scope.
  - `role text` — likewise normalised.
  - `level text` — mirrors `applications.level`.
  - `interview_type text` — check constraint over a fixed vocabulary: `('behavioral', 'system_design', 'coding', 'case', 'sales_roleplay', 'domain', 'screen', 'other')`. It's data, so renaming a value orphans history — same warning as `ai_usage.feature` in `_shared/plans.ts`.
- `content text not null` — **the chunk's own text. Non-negotiable.** Embedding models change; a corpus you can't re-embed is a corpus you're stuck with.
- `embedding extensions.vector(1536)` — **nullable**, so a chunk can be inserted and embedded in a second pass. Rows awaiting embedding are simply `embedding is null`.
- `embedding_model text` — e.g. `text-embedding-3-small`. Lets you find un-migrated rows and re-embed incrementally when you change models.
- `provenance text not null` — check over `('company_site', 'company_blog', 'news', 'candidate_report', 'general_pattern', 'ai_inferred')`. PROJECT.md §3's hard line: generated content lives in the general layer only, and AI guesses about a *specific* company must be labelled `ai_inferred`, never dressed as low-confidence fact.
- `corroboration_count integer not null default 1` — independent sources agreeing. Drives the §6 confidence feature. Corroboration, not volume, so it isn't gameable.
- `source_url text`, `source_title text` — for displayable citations.
- `recap_id uuid references public.recaps (id) on delete cascade` — set when the chunk came from a user's own recap, so deleting a recap removes its embedding.
- `token_count integer`
- `created_at timestamptz not null default now()`

### 1.3 Indexes

```sql
-- HNSW for cosine similarity. Build after the first bulk load if seeding.
create index prep_chunks_embedding_idx on public.prep_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- The metadata filters that run alongside every similarity search.
create index prep_chunks_scope_idx
  on public.prep_chunks (company, role, level, interview_type);
create index prep_chunks_user_idx on public.prep_chunks (user_id);
-- Finds work for the embedding pass.
create index prep_chunks_pending_idx
  on public.prep_chunks (created_at) where embedding is null;
```

### 1.4 RLS

```sql
alter table public.prep_chunks enable row level security;

-- Read: your own rows plus the shared corpus.
create policy "read own and shared prep chunks" on public.prep_chunks
  for select using (user_id is null or user_id = auth.uid());

-- Write: only your own. Shared rows are written by the ingest function with the
-- service role, which bypasses RLS — a client must never be able to insert into
-- the shared corpus, or one user can poison every user's prep.
create policy "insert own prep chunks" on public.prep_chunks
  for insert with check (user_id = auth.uid());
create policy "update own prep chunks" on public.prep_chunks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own prep chunks" on public.prep_chunks
  for delete using (user_id = auth.uid());
```

That asymmetry — read shared, write only own — is the security crux of the whole phase. Do not collapse it into a single `for all` policy.

### 1.5 The retrieval RPC

pgvector similarity search can't be expressed through PostgREST filters, so retrieval is a function.

```sql
create or replace function public.match_prep_chunks(
  query_embedding extensions.vector(1536),
  p_company text default null,
  p_role text default null,
  p_level text default null,
  p_interview_type text default null,
  match_count integer default 8,
  min_similarity real default 0.0
)
returns table (
  id uuid, content text, provenance text, corroboration_count integer,
  source_url text, source_title text, is_personal boolean, similarity real
)
language sql stable
security invoker              -- MUST be invoker: RLS is the isolation boundary.
set search_path = public, extensions
as $$
  select c.id, c.content, c.provenance, c.corroboration_count,
         c.source_url, c.source_title,
         c.user_id is not null as is_personal,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.prep_chunks c
  where c.embedding is not null
    -- Null filter = don't constrain. Null column = general, always eligible.
    and (p_company is null or c.company is null or c.company = p_company)
    and (p_role is null or c.role is null or c.role = p_role)
    and (p_level is null or c.level is null or c.level = p_level)
    and (p_interview_type is null or c.interview_type is null
         or c.interview_type = p_interview_type)
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

**`security invoker`, never `definer`.** Definer would return other users' private recaps to anyone who asked. The `or c.<col> is null` clauses are what make graceful degradation work: a brand-new scope retrieves nothing company-specific but still finds general role material, so the room is never empty (§2 cold-start).

### 1.6 Grants — not optional

Per the `0003` rule (Supabase no longer auto-grants; missing grants surface as `42501` with policies that look perfect):

```sql
grant select, insert, update, delete on public.prep_chunks to authenticated;
grant select, insert, update, delete on public.prep_chunks to service_role;
grant execute on function public.match_prep_chunks(
  extensions.vector, text, text, text, text, integer, real) to authenticated;
```

---

## 2. Edge Functions

Follow the existing conventions in `supabase/functions/` — `_shared/` for anything two functions touch, `HttpError` for user-readable refusals, everything that can decline for free declines before the model call.

### 2.1 `_shared/embed.ts` (new)

One function: `embedTexts(texts: string[], env): Promise<number[][]>`.

- Calls OpenAI `/v1/embeddings`, model `text-embedding-3-small`, batched (it accepts arrays — one request per batch, not per chunk).
- Reads `OPENAI_API_KEY` from the environment. Extend `readEnvironment` in `_shared/model.ts` or mirror its pattern; **never** a `VITE_` prefix.
- Returns vectors in input order. Assert length match — a silent misalignment writes every embedding to the wrong row.
- Map upstream status codes to messages the way `upstreamMessage` already does.

### 2.2 `ingest-company` (new)

Trigger: user adds a `prep_source` URL, or adds an application for a company with no corpus yet.

1. Fetch the URL. Enforce a byte cap, a timeout, and `text/html` or `text/plain` only.
2. Extract readable text (Readability or Cheerio) — strip nav, footer, scripts.
3. Chunk to **~400 tokens with ~15% overlap**. Small chunks retrieve better and stay portable across embedding models.
4. Insert rows with `user_id = null`, normalised `company`, `provenance` per source type, `source_url`/`source_title`, `embedding = null`.
5. Embed in batches, write back `embedding` + `embedding_model`.
6. Update `prep_sources.status` → `indexed` / `failed`.

Constraints: **first-party sources only** — the company's own site and news. No Glassdoor, no LinkedIn, no interview-experience aggregators (PROJECT.md §3/§5). Run it as a background job (Supabase cron or a queued invocation); fetching and embedding a dozen pages is far too slow for a request cycle.

### 2.3 `embed-recap` (new, or fold into the recap write path)

When a recap is saved: chunk `questions` + `notes`, embed, insert with `user_id = <owner>`, `recap_id` set, `company`/`role`/`level` from the parent application, `interview_type` from `recaps.round_type`, `provenance = 'candidate_report'`.

This is the compounding loop. It must be visible in the UI — Home already renders "Deepest prep space · Cold start · 0 sources · 0 recaps", so those counts should move and the "prep space levels up" moment should fire (§10).

> **Cross-user contribution is a separate, later decision.** Ship the personal layer private (`user_id` set). Promoting an anonymised recap chunk into the shared corpus (`user_id = null`, `corroboration_count` incremented on agreement) is the flywheel, and it needs a consent flow plus the §11 filter — *was I asked not to share this? generic or their custom problem?* Don't quietly default users into donating their notes.

### 2.4 `prep-chat` (new)

1. Auth the caller from the `Authorization` header (same as `analyze-resume`).
2. **Quota check.** `_shared/plans.ts` already defines `chat` — free 5/day, pro 100/day. Reuse `_shared/quota.ts`; do not invent a second limiter.
3. Embed the question (one short call, negligible cost).
4. Call `match_prep_chunks` with the application's `company`/`role`/`level`, plus `interview_type` if the UI scopes it.
5. Build the prompt: retrieved chunks only, each tagged with its provenance and index. Instruct the model to **answer only from the supplied context, cite by index, and say plainly when the context doesn't cover the question.** Never invent company-specific facts.
6. Claude Haiku for generation. **Enable prompt caching** on the static instruction block.
7. Persist the exchange to `prep_messages` with `citations` populated — the jsonb column already exists for this.
8. Return `{ content, citations }` matching the existing `PrepAnswer` type.

---

## 3. Client wiring

- Implement `answerPrepQuestion` in `src/lib/ai/edge.ts` — the only method still delegating to `mockAiProvider` that matters this phase. Keep `mock.ts` working: it's the default provider and local dev runs on it.
- Add data hooks under `src/data/` (one file per domain, cache keys in `queryKeys.ts` namespaced by user id). **Components never call `supabase` directly** — TECHNICAL.md §5.
- `CompanyPrepTab.tsx` already renders chat, sources, and layer indicators. Wire it to real data; **render provenance visibly per answer** — a citation the user can weigh is the trust feature (§10). Don't show a bare confidence number without its source label (§6).
- Keep every state in its existing home: server data → React Query, navigation → URL, ephemeral → `store.tsx`.

---

## 4. Invariants — do not break these

1. **`user_id IS NULL` = shared.** Don't add `default auth.uid()` to `prep_chunks.user_id`.
2. **Read shared, write only own.** Never let a client insert a `user_id = null` row.
3. **`security invoker` on the RPC.**
4. **Every new table and function needs an explicit grant** or it's `42501`.
5. **Keep `content`.** Never store a vector without the text that produced it.
6. **Never present fabricated company-specific facts.** Unsourced model output is `ai_inferred` and labelled, or it's general-layer, or it isn't shown.
7. **Keys stay server-side.** No `VITE_OPENAI_*`, ever.
8. **The mock keeps working.** `VITE_AI_PROVIDER` defaults to mock; that default is the spend guard.
9. **Migrations are immutable.** New number, every time.

## 5. Out of scope for this phase (updated 5 Aug)

~~Cross-user promotion~~ — **in MVP** with asymmetric rules (company facts vs interview claims). Still out: the confidence *number* in UI · job discovery · mock interview · evaluation engine · re-embedding tooling.

## 6. Definition of done

A user confirms `company_domain`, adds a first-party URL (robots-allow) or paste/PDF, sees claims indexed; asks in Company Prep and gets an answer grounded in claims with provenance; Saves to prep via checklist; a second independent candidate can raise an interview claim to shared at corroboration ≥ 2 with a `candidate_report`.

**Implemented 5 Aug 2026** in migration `0007` and functions `ingest-prep-source`, `prep-chat`, `save-prep-claims`. Hosted apply + deploy still required for production.
