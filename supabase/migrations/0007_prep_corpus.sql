-- Company prep corpus: claim-based RAG, not verbatim page storage.
--
-- prep_chunks holds restated atomic claims. user_id IS NULL means shared
-- corpus (service role writes those). Interview/process claims always start
-- private; company facts from first-party or news may be shared immediately.
-- See PROJECT.md §2/§3 and PHASE3 decisions locked 5 Aug 2026.

-- ---------------------------------------------------------------- extension

create extension if not exists vector with schema extensions;

-- ------------------------------------------------------- applications domain

alter table public.applications
  add column if not exists company_domain text;

comment on column public.applications.company_domain is
  'Confirmed registrable domain for first-party detection (e.g. abnormal.ai). Guessed from posting_url; user confirms.';

-- --------------------------------------------------------- prep_sources cols

alter table public.prep_sources
  add column if not exists scope text not null default 'role'
    check (scope in ('company', 'role'));

alter table public.prep_sources
  add column if not exists input_kind text not null default 'url'
    check (input_kind in ('url', 'pdf', 'paste'));

alter table public.prep_sources
  add column if not exists storage_path text;

alter table public.prep_sources
  add column if not exists paste_body text;

alter table public.prep_sources
  add column if not exists error text;

comment on column public.prep_sources.paste_body is
  'Ephemeral paste text; cleared after claim extraction.';

-- -------------------------------------------------------- prep-sources bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prep-sources', 'prep-sources', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "own prep source files read" on storage.objects
  for select using (
    bucket_id = 'prep-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own prep source files insert" on storage.objects
  for insert with check (
    bucket_id = 'prep-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own prep source files update" on storage.objects
  for update using (
    bucket_id = 'prep-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'prep-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own prep source files delete" on storage.objects
  for delete using (
    bucket_id = 'prep-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --------------------------------------------------------------- prep_chunks

-- user_id has NO default auth.uid(). Null = shared corpus. Do not "fix" this.
create table public.prep_chunks (
  id uuid primary key default gen_random_uuid(),
  -- Null = shared across authenticated users. Private rows set the owner.
  user_id uuid references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  source_id uuid references public.prep_sources (id) on delete set null,
  recap_id uuid references public.recaps (id) on delete cascade,

  -- Content key. Null role/level means company-wide scope.
  company text,
  role text,
  level text,
  interview_type text check (
    interview_type is null or interview_type in (
      'behavioral', 'system_design', 'coding', 'case',
      'sales_roleplay', 'domain', 'screen', 'other'
    )
  ),

  claim_kind text not null check (
    claim_kind in ('company_fact', 'interview_process')
  ),
  content text not null,

  embedding extensions.vector(1536),
  embedding_model text,

  provenance text not null check (
    provenance in (
      'company_site',
      'company_blog',
      'news',
      'user_supplied_thirdparty',
      'candidate_report',
      'general_pattern',
      'ai_inferred'
    )
  ),
  corroboration_count integer not null default 1,
  claim_group_id uuid not null default gen_random_uuid(),

  source_url text,
  source_title text,
  token_count integer,

  created_at timestamptz not null default now()
);

comment on table public.prep_chunks is
  'Restated atomic claims for company prep. user_id null = shared; never store verbatim page text.';

comment on column public.prep_chunks.user_id is
  'NULL means shared corpus (written only by service role). No default — do not add auth.uid().';

create index prep_chunks_embedding_idx on public.prep_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create index prep_chunks_scope_idx
  on public.prep_chunks (company, role, level, claim_kind);

create index prep_chunks_user_idx on public.prep_chunks (user_id);
create index prep_chunks_group_idx on public.prep_chunks (claim_group_id);
create index prep_chunks_pending_idx
  on public.prep_chunks (created_at) where embedding is null;

alter table public.prep_chunks enable row level security;

-- Read own rows plus the shared corpus.
create policy "read own and shared prep chunks" on public.prep_chunks
  for select using (user_id is null or user_id = auth.uid());

-- Clients write only their own private rows. Shared inserts use service_role.
create policy "insert own prep chunks" on public.prep_chunks
  for insert with check (user_id = auth.uid());

create policy "update own prep chunks" on public.prep_chunks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "delete own prep chunks" on public.prep_chunks
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------- match RPC

create or replace function public.match_prep_chunks(
  query_embedding extensions.vector(1536),
  p_company text default null,
  p_role text default null,
  p_level text default null,
  p_interview_type text default null,
  p_claim_kind text default null,
  match_count integer default 8,
  min_similarity real default 0.0
)
returns table (
  id uuid,
  content text,
  provenance text,
  claim_kind text,
  corroboration_count integer,
  source_url text,
  source_title text,
  is_personal boolean,
  similarity real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.content,
    c.provenance,
    c.claim_kind,
    c.corroboration_count,
    c.source_url,
    c.source_title,
    c.user_id is not null as is_personal,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.prep_chunks c
  where c.embedding is not null
    and (p_company is null or c.company is null or c.company = p_company)
    and (p_role is null or c.role is null or c.role = p_role)
    and (p_level is null or c.level is null or c.level = p_level)
    and (p_interview_type is null or c.interview_type is null
         or c.interview_type = p_interview_type)
    and (p_claim_kind is null or c.claim_kind = p_claim_kind)
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- --------------------------------------------------------------- grants

grant select, insert, update, delete on public.prep_chunks to authenticated;
grant select, insert, update, delete on public.prep_chunks to service_role;

grant execute on function public.match_prep_chunks(
  extensions.vector,
  text, text, text, text, text, integer, real
) to authenticated;

grant execute on function public.match_prep_chunks(
  extensions.vector,
  text, text, text, text, text, integer, real
) to service_role;

-- --------------------------------------------- ai_usage: relevance_check

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage
  add constraint ai_usage_feature_check
  check (feature in (
    'resume_analysis',
    'resume_rewrite',
    'chat',
    'relevance_check'
  ));
