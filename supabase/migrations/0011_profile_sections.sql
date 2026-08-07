-- Profile contact + education / projects / certifications spine.
-- Until now tailor-resume hardcoded these empty; analyze-resume already extracts
-- them into resume_reports.parsed, but onboarding dropped them on confirm.

-- ----------------------------------------------------------- profiles contact

alter table public.profiles
  add column if not exists phone text,
  add column if not exists location text,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists summary text;

comment on column public.profiles.phone is
  'Optional phone from the base resume parse or typed on the profile.';
comment on column public.profiles.location is
  'City / region as printed on the resume.';
comment on column public.profiles.links is
  'JSON array of { label, url } — LinkedIn, GitHub, portfolio, etc.';
comment on column public.profiles.summary is
  'Short professional summary from the base resume; tailor may shrink it.';

-- -------------------------------- education / projects / certifications

create table public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  organization text not null default '',
  date_range text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index education_user_idx on public.education (user_id, sort_order);

alter table public.education enable row level security;

create policy "own education" on public.education
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger education_set_updated_at
  before update on public.education
  for each row execute function public.set_updated_at();

create table public.education_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  education_id uuid not null
    references public.education (id) on delete cascade,
  text text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index education_lines_parent_idx
  on public.education_lines (education_id, sort_order);

alter table public.education_lines enable row level security;

create policy "own education lines" on public.education_lines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  organization text not null default '',
  date_range text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_idx on public.projects (user_id, sort_order);

alter table public.projects enable row level security;

create policy "own projects" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null
    references public.projects (id) on delete cascade,
  text text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_lines_parent_idx
  on public.project_lines (project_id, sort_order);

alter table public.project_lines enable row level security;

create policy "own project lines" on public.project_lines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  organization text not null default '',
  date_range text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index certifications_user_idx on public.certifications (user_id, sort_order);

alter table public.certifications enable row level security;

create policy "own certifications" on public.certifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger certifications_set_updated_at
  before update on public.certifications
  for each row execute function public.set_updated_at();

create table public.certification_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  certification_id uuid not null
    references public.certifications (id) on delete cascade,
  text text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index certification_lines_parent_idx
  on public.certification_lines (certification_id, sort_order);

alter table public.certification_lines enable row level security;

create policy "own certification lines" on public.certification_lines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Supabase no longer auto-grants new tables to authenticated.
grant select, insert, update, delete on public.education to authenticated;
grant select, insert, update, delete on public.education_lines to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_lines to authenticated;
grant select, insert, update, delete on public.certifications to authenticated;
grant select, insert, update, delete on public.certification_lines to authenticated;
