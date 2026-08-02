-- Prep, referral, and tailoring storage.
--
-- prep_sources and prep_messages back the "Add a source URL" and briefing-room
-- chat inputs. The referral and tailoring tables are created here so the layers
-- are real rows rather than counts, and are wired up once the AI provider talks
-- to a live model.

-- --------------------------------------------------------- company layer

create table public.prep_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  kind text not null default 'custom' check (
    kind in ('company_blog', 'careers', 'docs', 'news', 'custom')
  ),
  url text,
  title text,
  status text not null default 'pending'
    check (status in ('pending', 'indexed', 'failed')),
  created_at timestamptz not null default now()
);

create index prep_sources_application_idx
  on public.prep_sources (application_id, created_at);

alter table public.prep_sources enable row level security;

create policy "own prep sources" on public.prep_sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------ briefing room

create table public.prep_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Which layers an answer drew on, so provenance is always displayable.
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index prep_messages_application_idx
  on public.prep_messages (application_id, created_at);

alter table public.prep_messages enable row level security;

create policy "own prep messages" on public.prep_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- referrals

create table public.referral_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  name text not null,
  role text,
  tag text,
  note text,
  linkedin_url text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referral_contacts_application_idx
  on public.referral_contacts (application_id, created_at);

alter table public.referral_contacts enable row level security;

create policy "own referral contacts" on public.referral_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger referral_contacts_set_updated_at
  before update on public.referral_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- tailoring

create table public.tailorings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,
  model text,
  summary text,
  -- A named resume angle ("reliability-led"), so conversion can be compared
  -- across variants later.
  variant text,
  created_at timestamptz not null default now()
);

create index tailorings_application_idx
  on public.tailorings (application_id, created_at desc);

alter table public.tailorings enable row level security;

create policy "own tailorings" on public.tailorings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.tailoring_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  tailoring_id uuid not null
    references public.tailorings (id) on delete cascade,
  source_bullet_id uuid
    references public.experience_bullets (id) on delete set null,
  before_text text not null,
  after_text text not null,
  rationale text,
  sort_order integer not null default 0
);

create index tailoring_changes_tailoring_idx
  on public.tailoring_changes (tailoring_id, sort_order);

alter table public.tailoring_changes enable row level security;

create policy "own tailoring changes" on public.tailoring_changes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.ats_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  tailoring_id uuid not null
    references public.tailorings (id) on delete cascade,
  keyword text not null,
  covered boolean not null default false,
  -- Shown next to a missing keyword; never used to stuff unbacked claims.
  hint text
);

create index ats_keywords_tailoring_idx
  on public.ats_keywords (tailoring_id, covered);

alter table public.ats_keywords enable row level security;

create policy "own ats keywords" on public.ats_keywords
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
