-- PrepFor.Me core schema: the profile spine, applications, and recaps.
--
-- Every table is owned by exactly one user and guarded by row level security.
-- Child tables carry a denormalized user_id (defaulting to auth.uid()) so a
-- policy is a single index-backed comparison rather than a subquery per row.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- utilities

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  headline text,
  email text,
  notice_period text,
  work_authorization text,
  salary_expectation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'The spine: everything tailoring and autofill produce is generated from here.';

alter table public.profiles enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ user settings

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  referral_channel text not null default 'invite'
    check (referral_channel in ('invite', 'message')),
  linkedin_premium boolean not null default false,
  char_limit integer not null default 200
    check (char_limit between 120 and 300),
  nudge_recaps boolean not null default true,
  flag_stale_applications boolean not null default true,
  flag_stale_days integer not null default 10 check (flag_stale_days > 0),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "own settings" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Every new account gets a profile and a settings row, so the client never has
-- to special-case their absence.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------- experience spine

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  company text not null,
  start_date date,
  end_date date,
  summary text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experiences_user_idx on public.experiences (user_id, sort_order);

alter table public.experiences enable row level security;

create policy "own experiences" on public.experiences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function public.set_updated_at();

create table public.experience_bullets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  experience_id uuid not null
    references public.experiences (id) on delete cascade,
  text text not null,
  -- Disabled bullets stay in the profile but are withheld from tailoring.
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index experience_bullets_experience_idx
  on public.experience_bullets (experience_id, sort_order);

alter table public.experience_bullets enable row level security;

create policy "own bullets" on public.experience_bullets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index skills_user_idx on public.skills (user_id, sort_order);

alter table public.skills enable row level security;

create policy "own skills" on public.skills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------- applications

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  company text not null,
  role text not null,
  level text,
  stage text not null default 'Saved' check (
    stage in (
      'Saved', 'Applied', 'Screen', 'Technical',
      'Onsite', 'Offer', 'Rejected', 'Withdrawn'
    )
  ),
  posting_url text,
  job_description text,
  next_action text,
  next_action_at timestamptz,
  applied_at timestamptz,
  -- Flipped once the user has run a tailoring pass for this role.
  resume_tailored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_idx on public.applications (user_id, updated_at desc);
create index applications_stage_idx on public.applications (user_id, stage);

alter table public.applications enable row level security;

create policy "own applications" on public.applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- stage history

-- Append-only history. Response rate and interview rate are computed from this
-- table, so it must record every transition regardless of which client made it.
create table public.application_stage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  occurred_at timestamptz not null default now()
);

create index application_stage_events_app_idx
  on public.application_stage_events (application_id, occurred_at);
create index application_stage_events_user_idx
  on public.application_stage_events (user_id, to_stage);

alter table public.application_stage_events enable row level security;

create policy "own stage events" on public.application_stage_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.record_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_stage_events
      (user_id, application_id, from_stage, to_stage, occurred_at)
    values (new.user_id, new.id, null, new.stage, new.created_at);

    if new.stage <> 'Saved' and new.applied_at is null then
      update public.applications
        set applied_at = new.created_at
        where id = new.id;
    end if;

  elsif new.stage is distinct from old.stage then
    insert into public.application_stage_events
      (user_id, application_id, from_stage, to_stage)
    values (new.user_id, new.id, old.stage, new.stage);
  end if;

  return new;
end;
$$;

create trigger applications_record_stage_insert
  after insert on public.applications
  for each row execute function public.record_stage_event();

create trigger applications_record_stage_update
  after update of stage on public.applications
  for each row execute function public.record_stage_event();

-- The first move off "Saved" is what "applied" means; stamp it once.
create or replace function public.stamp_applied_at()
returns trigger
language plpgsql
as $$
begin
  if new.applied_at is null and old.stage = 'Saved' and new.stage <> 'Saved' then
    new.applied_at = now();
  end if;
  return new;
end;
$$;

create trigger applications_stamp_applied_at
  before update of stage on public.applications
  for each row execute function public.stamp_applied_at();

-- -------------------------------------------------------------- recaps

-- The highest-value data in the product: what was actually asked.
create table public.recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  round_type text not null,
  round_number integer,
  questions text,
  outcome text check (outcome in ('rough', 'ok', 'went_well')),
  notes text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index recaps_application_idx
  on public.recaps (application_id, occurred_on desc);
create index recaps_user_idx on public.recaps (user_id);

alter table public.recaps enable row level security;

create policy "own recaps" on public.recaps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
