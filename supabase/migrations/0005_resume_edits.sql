-- Rewrites of the candidate's own lines, one row per suggestion.
--
-- Two tables rather than a jsonb column on resume_reports, for two reasons:
-- the pass row is the in-flight lock (see below), and accepting one suggestion
-- has to be a single-row update rather than a read-modify-write of an array
-- every other accept would race against.
--
-- Nothing here rewrites the resume. The rows are proposals with a status; the
-- rebuilt document substitutes the accepted ones by matching the original text,
-- and the uploaded PDF is never touched.

-- ------------------------------------------------------- one pass, one row

-- Written before the model call, not after, because this row *is* the lock:
-- `running` younger than the window is what a second press is refused against.
-- The same row later carries the token counts, so spend per pass is answerable
-- in SQL the same way it is for an analysis.
create table public.resume_improvements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  resume_id uuid not null
    references public.resumes (id) on delete cascade,
  -- The report the suggestions were derived from. Re-analyzing a resume writes
  -- a new report, and suggestions about the old one are then about text that may
  -- no longer be what the parse says — so the app reads edits by report_id and a
  -- superseded pass simply stops being visible instead of being deleted.
  report_id uuid not null
    references public.resume_reports (id) on delete cascade,
  model text not null,
  status text not null default 'running'
    check (status in ('running', 'done', 'failed')),
  error text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.resume_improvements is
  'One rewrite pass. Inserted as `running` before the model call, so the row doubles as a time-boxed lock against double-billing.';

-- Serves both the lock lookup (newest pass for a report) and the "has this
-- report already been improved" guard.
create index resume_improvements_report_idx
  on public.resume_improvements (report_id, created_at desc);

-- Backs the per-user-per-day cap, which is a count over this index.
create index resume_improvements_user_idx
  on public.resume_improvements (user_id, created_at desc);

alter table public.resume_improvements enable row level security;

create policy "own resume improvements" on public.resume_improvements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger resume_improvements_set_updated_at
  before update on public.resume_improvements
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- suggestions

create table public.resume_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  improvement_id uuid not null
    references public.resume_improvements (id) on delete cascade,
  -- Denormalised from the pass so the report screen reads suggestions with one
  -- query, and so a suggestion can be found again after the pass row is beside
  -- the point.
  resume_id uuid not null
    references public.resumes (id) on delete cascade,
  report_id uuid not null
    references public.resume_reports (id) on delete cascade,
  -- Which finding this answers. Kept as the category id plus the finding's own
  -- title rather than an index into the report's jsonb: an index would silently
  -- point at a different finding the moment the report is regenerated, and the
  -- title is what the model was given to refer to.
  category text not null check (
    category in ('parse', 'format', 'sections', 'impact', 'skills', 'length', 'contact')
  ),
  finding_title text not null,
  -- Copied verbatim out of the parse. This is the join key when the rebuild
  -- substitutes an accepted rewrite, so it is the one column that must not be
  -- normalised, trimmed differently, or "tidied" on the way in.
  original text not null,
  suggested text not null,
  -- Why, in the candidate's language. Also where "fill in the blank with the
  -- number of records" is said, for a rewrite that left one.
  note text not null default '',
  -- The rewrite contains `___` because the resume never stated the figure the
  -- bullet needs. Accepting one is fine; sending it without filling it in is
  -- not, so the UI has to say so and the rebuild has to keep saying so.
  has_blank boolean not null default false,
  -- Non-empty when the rewrite needs checking before it is trusted — currently
  -- set when it introduces a figure the original did not contain. Free text
  -- rather than an enum so a new check does not need a migration to describe
  -- itself; empty is the normal case.
  flag text not null default '',
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'dismissed')),
  -- The model's own ranking, so the list reads worst-first like the report does.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.resume_edits is
  'One proposed rewrite of one line the candidate wrote. `original` is verbatim from the parse and is how an accepted rewrite is matched into a rebuilt document.';

create index resume_edits_report_idx
  on public.resume_edits (report_id, sort_order);

alter table public.resume_edits enable row level security;

create policy "own resume edits" on public.resume_edits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger resume_edits_set_updated_at
  before update on public.resume_edits
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- grants

-- Same reason as 0003_grants.sql and 0004_resumes.sql: policies decide which
-- rows a role sees, grants decide whether the role reaches the table at all,
-- and since changelog #45329 nothing is granted by default.
grant select, insert, update, delete on public.resume_improvements to authenticated;
grant select, insert, update, delete on public.resume_edits to authenticated;

-- The improve-resume function writes the pass row and its suggestions, and has
-- to record a terminal `failed` even when the caller's request has gone away.
grant select, insert, update, delete on public.resume_improvements to service_role;
grant select, insert, update, delete on public.resume_edits to service_role;
