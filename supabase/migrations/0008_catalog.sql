-- Curated company / role / level catalog for typeahead entry and stable prep keys.
-- applications still store display text; FKs point at catalog rows when picked.
-- Customs leave FKs null and fall back to normalised free text for prep matching.

-- ---------------------------------------------------------------- levels

create table public.catalog_levels (
  id text primary key,
  label text not null,
  sort_order int not null
);

comment on table public.catalog_levels is
  'Shared seniority ladder (tech and non-tech). Never L1/L2/L3 as primary ids.';

insert into public.catalog_levels (id, label, sort_order) values
  ('intern', 'Intern', 10),
  ('associate', 'Associate', 20),
  ('entry', 'Entry', 30),
  ('mid', 'Mid', 40),
  ('senior', 'Senior', 50),
  ('staff', 'Staff', 60),
  ('principal', 'Principal', 70),
  ('manager', 'Manager', 80),
  ('director', 'Director', 90),
  ('vp', 'VP', 100),
  ('executive', 'C-level / Executive', 110);

alter table public.catalog_levels enable row level security;

create policy "read catalog levels" on public.catalog_levels
  for select to authenticated using (true);

grant select on public.catalog_levels to authenticated;
grant select, insert, update, delete on public.catalog_levels to service_role;

-- -------------------------------------------------------------- companies

create table public.catalog_companies (
  id text primary key,
  name text not null,
  domain text,
  linkedin_company_id text
);

comment on column public.catalog_companies.linkedin_company_id is
  'LinkedIn numeric org id for people-search currentCompany facet; null = keyword fallback.';

create index catalog_companies_name_idx on public.catalog_companies (lower(name));

insert into public.catalog_companies (id, name, domain, linkedin_company_id) values
  ('google', 'Google', 'google.com', '1441'),
  ('meta', 'Meta', 'meta.com', '10667'),
  ('amazon', 'Amazon', 'amazon.com', '1586'),
  ('apple', 'Apple', 'apple.com', '162479'),
  ('microsoft', 'Microsoft', 'microsoft.com', '1035'),
  ('netflix', 'Netflix', 'netflix.com', '1651'),
  ('openai', 'OpenAI', 'openai.com', '14411469'),
  ('anthropic', 'Anthropic', 'anthropic.com', null),
  ('stripe', 'Stripe', 'stripe.com', '210064'),
  ('uber', 'Uber', 'uber.com', '1815218'),
  ('airbnb', 'Airbnb', 'airbnb.com', '309294'),
  ('figma', 'Figma', 'figma.com', '3650503'),
  ('notion', 'Notion', 'notion.so', '3083545'),
  ('spotify', 'Spotify', 'spotify.com', '2017'),
  ('salesforce', 'Salesforce', 'salesforce.com', '3185'),
  ('adobe', 'Adobe', 'adobe.com', '1480'),
  ('nvidia', 'NVIDIA', 'nvidia.com', '3608'),
  ('oracle', 'Oracle', 'oracle.com', '1028'),
  ('ibm', 'IBM', 'ibm.com', '1009'),
  ('intel', 'Intel', 'intel.com', '1053'),
  ('cisco', 'Cisco', 'cisco.com', '1063'),
  ('shopify', 'Shopify', 'shopify.com', '206049'),
  ('square', 'Block (Square)', 'block.xyz', '11446'),
  ('coinbase', 'Coinbase', 'coinbase.com', '2805235'),
  ('databricks', 'Databricks', 'databricks.com', '2495577'),
  ('snowflake', 'Snowflake', 'snowflake.com', '3209597'),
  ('cloudflare', 'Cloudflare', 'cloudflare.com', '407222'),
  ('twilio', 'Twilio', 'twilio.com', '1345364'),
  ('atlassian', 'Atlassian', 'atlassian.com', '22686'),
  ('dropbox', 'Dropbox', 'dropbox.com', '1484912'),
  ('linkedin', 'LinkedIn', 'linkedin.com', '1337'),
  ('goldman_sachs', 'Goldman Sachs', 'goldmansachs.com', '1382'),
  ('jpmorgan', 'JPMorgan Chase', 'jpmorganchase.com', '1068'),
  ('morgan_stanley', 'Morgan Stanley', 'morganstanley.com', '1405'),
  ('mckinsey', 'McKinsey & Company', 'mckinsey.com', '1403'),
  ('bain', 'Bain & Company', 'bain.com', '1414'),
  ('bcg', 'Boston Consulting Group', 'bcg.com', '1785'),
  ('deloitte', 'Deloitte', 'deloitte.com', '1038'),
  ('pwc', 'PwC', 'pwc.com', '1044'),
  ('ey', 'EY', 'ey.com', '1073'),
  ('accenture', 'Accenture', 'accenture.com', '1033'),
  ('robert_walters', 'Robert Walters', 'robertwalters.com', null);

alter table public.catalog_companies enable row level security;

create policy "read catalog companies" on public.catalog_companies
  for select to authenticated using (true);

grant select on public.catalog_companies to authenticated;
grant select, insert, update, delete on public.catalog_companies to service_role;

-- ------------------------------------------------------------------ roles

create table public.catalog_roles (
  id text primary key,
  name text not null
);

create index catalog_roles_name_idx on public.catalog_roles (lower(name));

insert into public.catalog_roles (id, name) values
  ('software_engineer', 'Software Engineer'),
  ('frontend_engineer', 'Frontend Engineer'),
  ('backend_engineer', 'Backend Engineer'),
  ('fullstack_engineer', 'Full-Stack Engineer'),
  ('mobile_engineer', 'Mobile Engineer'),
  ('devops_engineer', 'DevOps / SRE'),
  ('data_engineer', 'Data Engineer'),
  ('data_scientist', 'Data Scientist'),
  ('machine_learning_engineer', 'Machine Learning Engineer'),
  ('product_manager', 'Product Manager'),
  ('program_manager', 'Program Manager'),
  ('designer', 'Product Designer'),
  ('ux_researcher', 'UX Researcher'),
  ('engineering_manager', 'Engineering Manager'),
  ('technical_program_manager', 'Technical Program Manager'),
  ('solutions_engineer', 'Solutions Engineer'),
  ('sales_engineer', 'Sales Engineer'),
  ('account_executive', 'Account Executive'),
  ('customer_success', 'Customer Success'),
  ('recruiter', 'Recruiter'),
  ('recruitment_coordinator', 'Recruitment Coordinator'),
  ('talent_acquisition', 'Talent Acquisition'),
  ('hr_business_partner', 'HR Business Partner'),
  ('marketing_manager', 'Marketing Manager'),
  ('operations_manager', 'Operations Manager'),
  ('financial_analyst', 'Financial Analyst'),
  ('consultant', 'Consultant'),
  ('business_analyst', 'Business Analyst');

alter table public.catalog_roles enable row level security;

create policy "read catalog roles" on public.catalog_roles
  for select to authenticated using (true);

grant select on public.catalog_roles to authenticated;
grant select, insert, update, delete on public.catalog_roles to service_role;

-- ----------------------------------------------------------- role aliases

create table public.catalog_role_aliases (
  alias text primary key,
  role_id text not null references public.catalog_roles (id) on delete cascade
);

insert into public.catalog_role_aliases (alias, role_id) values
  ('swe', 'software_engineer'),
  ('sde', 'software_engineer'),
  ('software developer', 'software_engineer'),
  ('software development engineer', 'software_engineer'),
  ('front end engineer', 'frontend_engineer'),
  ('front-end engineer', 'frontend_engineer'),
  ('back end engineer', 'backend_engineer'),
  ('back-end engineer', 'backend_engineer'),
  ('full stack engineer', 'fullstack_engineer'),
  ('full-stack engineer', 'fullstack_engineer'),
  ('ios engineer', 'mobile_engineer'),
  ('android engineer', 'mobile_engineer'),
  ('sre', 'devops_engineer'),
  ('site reliability engineer', 'devops_engineer'),
  ('ml engineer', 'machine_learning_engineer'),
  ('mle', 'machine_learning_engineer'),
  ('pm', 'product_manager'),
  ('product owner', 'product_manager'),
  ('ux designer', 'designer'),
  ('ui designer', 'designer'),
  ('product designer', 'designer'),
  ('em', 'engineering_manager'),
  ('tpm', 'technical_program_manager'),
  ('ae', 'account_executive'),
  ('csm', 'customer_success'),
  ('ta', 'talent_acquisition'),
  ('talent partner', 'talent_acquisition'),
  ('recruiting coordinator', 'recruitment_coordinator'),
  ('recruitment coordinator ftc', 'recruitment_coordinator'),
  ('hrbp', 'hr_business_partner'),
  ('ba', 'business_analyst');

alter table public.catalog_role_aliases enable row level security;

create policy "read catalog role aliases" on public.catalog_role_aliases
  for select to authenticated using (true);

grant select on public.catalog_role_aliases to authenticated;
grant select, insert, update, delete on public.catalog_role_aliases to service_role;

-- --------------------------------------------------------------- requests

create table public.catalog_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  kind text not null check (kind in ('company', 'role')),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index catalog_requests_user_idx on public.catalog_requests (user_id, created_at desc);

alter table public.catalog_requests enable row level security;

create policy "own catalog requests" on public.catalog_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.catalog_requests to authenticated;
grant select, insert, update, delete on public.catalog_requests to service_role;

-- ----------------------------------------------------------- applications

alter table public.applications
  add column if not exists company_id text
    references public.catalog_companies (id) on delete set null;

alter table public.applications
  add column if not exists role_id text
    references public.catalog_roles (id) on delete set null;

alter table public.applications
  add column if not exists level_id text
    references public.catalog_levels (id) on delete set null;

alter table public.applications
  add column if not exists specialty text;

alter table public.applications
  add column if not exists employment_type text
    check (
      employment_type is null
      or employment_type in ('full_time', 'contract', 'intern', 'other')
    );

comment on column public.applications.company_id is
  'Catalog company when picked via typeahead; null = custom free-text company.';
comment on column public.applications.role_id is
  'Catalog role family when picked; null = custom title.';
comment on column public.applications.level_id is
  'Catalog seniority id (mid, senior, …); level text is the display label.';
comment on column public.applications.specialty is
  'Optional focus within the role family (Frontend, Enterprise, …).';
comment on column public.applications.employment_type is
  'full_time | contract | intern | other — keeps (FTC) out of the role title.';

create index applications_company_id_idx on public.applications (company_id);
create index applications_role_id_idx on public.applications (role_id);
