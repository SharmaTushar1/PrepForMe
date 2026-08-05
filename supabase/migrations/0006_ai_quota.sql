-- Per-user allowances for the calls that cost money.
--
-- The app is publicly reachable and every analysis is a real Anthropic call
-- against one API key, so "anyone who signs up" and "anyone who can spend my
-- money" were the same set of people. This migration draws the line, and does
-- two things to make it hold:
--
--   1. `ai_usage`, a ledger of *billed attempts*. The functions already counted
--      per day, but they counted rows in `resume_reports` — successes. At an
--      allowance of one a month that is a hole rather than a limit: an analysis
--      that fails after the model call writes no report, so the attempt is
--      invisible and can be repeated at ten cents a time. A ledger row is
--      written immediately before the model call instead, so what is counted is
--      what is charged. Everything the functions refuse for free happens earlier
--      and never reaches it.
--
--   2. Takes `plan` out of the client's hands. See below — without this the
--      allowance is opt-out.

-- ------------------------------------------------------------ billed attempts

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  -- Matches the `Feature` union in supabase/functions/_shared/plans.ts. Kept as
  -- text with a check rather than an enum so adding a metered feature is a
  -- one-line migration; the values are data, and renaming one refills every
  -- user's allowance by orphaning the rows that were counting against it.
  feature text not null
    check (feature in ('resume_analysis', 'resume_rewrite', 'chat')),

  -- What it was spent on, for support questions like "where did my analysis go".
  -- Deliberately not a foreign key: the row must outlive the resume it refers
  -- to, or deleting a resume would refund the money already spent on it.
  subject_id uuid,

  created_at timestamptz not null default now()
);

-- No token columns on purpose. This table answers one question — how many billed
-- attempts has this user made in this period — and `resume_reports` and
-- `resume_improvements` already carry the token counts for the calls that
-- returned. Duplicating them here would mean a second write after the call, which
-- is the only reason the client would ever need `update` on this table, and not
-- having to grant that is worth more than the redundancy.

comment on table public.ai_usage is
  'One row per billed model call, written before the call. The allowance in _shared/plans.ts is counted over this.';

-- The only query made of this table: count one user's rows for one feature since
-- the start of the period. Ordered descending to also serve "when was the last
-- one", which is what the UI shows next to a spent allowance.
create index ai_usage_user_feature_idx
  on public.ai_usage (user_id, feature, created_at desc);

alter table public.ai_usage enable row level security;

-- Insert and select, over the owner's own rows. Emphatically not `for all`.
--
-- The functions talk to the database as the calling user rather than with the
-- service key, so they need to be able to write this. That is safe in the one
-- direction that matters: inserting a row *spends* an allowance, so the worst a
-- forged insert achieves is denying the forger their own next analysis. Raising
-- an allowance would need `delete` or `update`, and neither is granted to
-- `authenticated` below — which is also why this table carries no column the
-- functions would want to revise after the fact.
create policy "own ai usage read" on public.ai_usage
  for select using (user_id = auth.uid());

create policy "own ai usage write" on public.ai_usage
  for insert with check (user_id = auth.uid());

grant select, insert on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

-- --------------------------------------------------- plan is not self-service

-- `user_settings` has a `for all` policy over the owner's own row, and 0003
-- granted `update` on the whole table. Between them, any signed-in user could
-- PATCH /rest/v1/user_settings and set plan = 'pro', which is a thirtyfold
-- allowance increase for the price of one HTTP request. Nothing in the app has
-- ever written this column — it has no UI, and Settings only reads it — so
-- narrowing the grant costs the client nothing it was using.
--
-- Postgres has no `revoke update (column)`: a column-level grant is expressed by
-- granting the columns that *are* allowed, which replaces the table-wide one. So
-- every other column has to be named, and a column added to this table later
-- will not be writable until it is added here too. That is the trade for having
-- the database enforce this rather than trusting a policy to remember.
--
-- `insert` is narrowed for the same reason, and it is the less obvious half:
-- 0003 also granted `delete`, so a client that could only be stopped from
-- *updating* `plan` could still delete its settings row and insert a replacement
-- with plan = 'pro'. `useSettings` does exactly that insert when the row is
-- missing, which is why the path exists at all. Restricted to these columns, a
-- client-side insert can only take the column default, which is 'free'.
--
-- `updated_at` is in neither list. The client never sends it and the
-- user_settings_set_updated_at trigger writes it, which is not checked against
-- the caller's column privileges.
revoke insert, update on public.user_settings from authenticated;

grant insert (
  user_id,
  referral_channel,
  linkedin_premium,
  char_limit,
  nudge_recaps,
  flag_stale_applications,
  flag_stale_days
) on public.user_settings to authenticated;

grant update (
  referral_channel,
  linkedin_premium,
  char_limit,
  nudge_recaps,
  flag_stale_applications,
  flag_stale_days
) on public.user_settings to authenticated;

-- The functions read `plan` to size the allowance, and promoting someone is a
-- server-side act.
grant select, update on public.user_settings to service_role;
