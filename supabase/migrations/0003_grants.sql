-- Data API grants.
--
-- Supabase stopped granting table privileges to the Data API roles when a table
-- is created (changelog #45329, the default for projects made after
-- 2026-05-30). Without an explicit grant a table can exist, have row level
-- security policies, and still answer every PostgREST request with 42501
-- "permission denied for table". Grants decide whether a role can reach a table
-- at all; the policies in 0001 and 0002 still decide which rows it sees.
--
-- Only `authenticated` is granted. Every table here belongs to exactly one user
-- and nothing in the app reads before sign-in, so `anon` needs no access. A
-- later Edge Function that talks to these tables with the service key will need
-- its own grant to `service_role`.

grant usage on schema public to authenticated;

-- 0001_core.sql
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.experiences to authenticated;
grant select, insert, update, delete on public.experience_bullets to authenticated;
grant select, insert, update, delete on public.skills to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.recaps to authenticated;

-- Append-only history, written by the record_stage_event trigger rather than by
-- the client, so the client only ever reads it.
grant select on public.application_stage_events to authenticated;

-- 0002_prep.sql
grant select, insert, update, delete on public.prep_sources to authenticated;
grant select, insert, update, delete on public.prep_messages to authenticated;
grant select, insert, update, delete on public.referral_contacts to authenticated;
grant select, insert, update, delete on public.tailorings to authenticated;
grant select, insert, update, delete on public.tailoring_changes to authenticated;
grant select, insert, update, delete on public.ats_keywords to authenticated;
