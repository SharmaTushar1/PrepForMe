-- Base resume storage and its ATS analysis.
--
-- The PDF itself lives in a private storage bucket, not in a column, so the
-- file is streamed rather than pulled through PostgREST. Everything derived
-- from it — the ATS report and the structured parse — lands in
-- resume_reports as jsonb, because the shape is owned by src/lib/ai/types.ts
-- and would otherwise need a migration every time a category is reworded.
--
-- Object path convention: `{user_id}/{resume_id}.pdf`. The first path segment
-- is the whole authorization story for storage, so nothing may write outside
-- its own folder.

-- ----------------------------------------------------------- storage bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- storage.objects is one table shared by every bucket, so each policy has to
-- name the bucket as well as the owner. auth.uid() is compared against the
-- leading folder of the object name, which is why the path convention above
-- is load-bearing rather than cosmetic.

create policy "own resume files read" on storage.objects
  for select using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own resume files insert" on storage.objects
  for insert with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own resume files update" on storage.objects
  for update using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own resume files delete" on storage.objects
  for delete using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------ resumes

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- `{user_id}/{resume_id}.pdf` within the `resumes` bucket.
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  byte_size integer not null,
  -- Filled in by the analyze-resume function; the page cap is enforced there,
  -- before the file is ever sent to a model.
  page_count integer,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'analyzed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.resumes is
  'One row per uploaded PDF. The file lives in the `resumes` storage bucket.';

create index resumes_user_idx on public.resumes (user_id, created_at desc);

alter table public.resumes enable row level security;

create policy "own resumes" on public.resumes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- resume reports

-- One Claude call produces both halves, so they are one row: `report` is the
-- ATS review the user reads, `parsed` is the structured resume they review
-- before anything is written to the profile spine. Token counts are kept so
-- spend per analysis is answerable without leaving the database.
create table public.resume_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  resume_id uuid not null
    references public.resumes (id) on delete cascade,
  model text not null,
  overall_score integer not null check (overall_score between 0 and 100),
  summary text,
  report jsonb not null default '{}'::jsonb,
  parsed jsonb not null default '{}'::jsonb,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index resume_reports_resume_idx
  on public.resume_reports (resume_id, created_at desc);

-- Backs the per-user-per-day analysis cap, which is a count over this index.
create index resume_reports_user_idx
  on public.resume_reports (user_id, created_at desc);

alter table public.resume_reports enable row level security;

create policy "own resume reports" on public.resume_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------- profile link

-- Which upload is the user's canonical resume. Nullable and set null on
-- delete, so deleting a resume never takes the profile down with it. Pointing
-- it at someone else's row would still read as nothing, because the row is
-- unreachable under the resumes policy above.
alter table public.profiles
  add column base_resume_id uuid references public.resumes (id) on delete set null;

-- ------------------------------------------------------------------- grants

-- Same reason as 0003_grants.sql: since changelog #45329 a table can exist,
-- have correct policies, and still answer every request with 42501 until the
-- role is granted. Policies decide which rows; grants decide whether the role
-- reaches the table at all.
grant select, insert, update, delete on public.resumes to authenticated;
grant select, insert, update, delete on public.resume_reports to authenticated;

-- The analyze-resume Edge Function is the first thing in this project to hold
-- the service key. It writes a report and a terminal `failed` status even when
-- the caller's request has already gone away, so it needs its own grant —
-- exactly the case 0003_grants.sql flagged as coming. Granted whichever client
-- the function ends up using; under the caller's JWT the policies above still
-- apply, so this is a fallback rather than the intended path.
grant select, insert, update, delete on public.resumes to service_role;
grant select, insert, update, delete on public.resume_reports to service_role;

-- Only enough of profiles to point base_resume_id at the analyzed upload.
grant select, update on public.profiles to service_role;
