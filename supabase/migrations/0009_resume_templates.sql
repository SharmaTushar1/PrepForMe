-- Resume template selection + per-application tailored structured fields.
-- Output PDFs are rendered from templates (Chromium); this stores choices and
-- the tailored field payload only.

alter table public.profiles
  add column if not exists default_template_id text not null default 'classic'
    check (default_template_id in ('classic', 'compact'));

comment on column public.profiles.default_template_id is
  'Free templates: classic | compact. Paid templates come later.';

alter table public.applications
  add column if not exists template_id text
    check (template_id is null or template_id in ('classic', 'compact'));

comment on column public.applications.template_id is
  'Override of profiles.default_template_id; null means use the profile default.';

alter table public.applications
  add column if not exists tailored_resume jsonb;

comment on column public.applications.tailored_resume is
  'Structured resume fields for this role after tailor (ParsedResume-compatible). Null until tailored.';
