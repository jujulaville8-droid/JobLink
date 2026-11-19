-- Employer shortlist: per-job triage overrides (pin / remove / interview) and the
-- employer's last shortlist open per job (drives the "new" marker). Employer-only;
-- the shortlist itself is computed from applications + application_fit_verdicts.
create table if not exists public.shortlist_overrides (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  employer_id uuid not null,
  action text not null check (action in ('pin', 'remove', 'interview')),
  created_at timestamptz not null default now(),
  unique (application_id, action)
);

create table if not exists public.shortlist_opens (
  employer_id uuid not null,
  job_id uuid not null references public.job_listings(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (employer_id, job_id)
);

create index if not exists shortlist_overrides_application_idx on public.shortlist_overrides (application_id);
create index if not exists shortlist_overrides_employer_idx on public.shortlist_overrides (employer_id);
create index if not exists shortlist_opens_employer_job_idx on public.shortlist_opens (employer_id, job_id);

alter table public.shortlist_overrides enable row level security;
alter table public.shortlist_opens enable row level security;

revoke all on public.shortlist_overrides from public, anon, authenticated;
revoke all on public.shortlist_opens from public, anon, authenticated;
grant select, insert, update, delete on public.shortlist_overrides to authenticated;
grant select, insert, update, delete on public.shortlist_opens to authenticated;
grant all on public.shortlist_overrides to service_role;
grant all on public.shortlist_opens to service_role;

-- shortlist_overrides: the employer sees and edits only their own rows, and may only
-- write rows for applications to jobs posted by a company they own.
create policy shortlist_overrides_employer_select on public.shortlist_overrides
  for select to authenticated using (employer_id = (select auth.uid()));

create policy shortlist_overrides_employer_insert on public.shortlist_overrides
  for insert to authenticated with check (
    employer_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      join public.job_listings j on j.id = a.job_id
      join public.companies c on c.id = j.company_id
      where a.id = shortlist_overrides.application_id and c.user_id = (select auth.uid())
    )
  );

create policy shortlist_overrides_employer_update on public.shortlist_overrides
  for update to authenticated
  using (employer_id = (select auth.uid()))
  with check (
    employer_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      join public.job_listings j on j.id = a.job_id
      join public.companies c on c.id = j.company_id
      where a.id = shortlist_overrides.application_id and c.user_id = (select auth.uid())
    )
  );

create policy shortlist_overrides_employer_delete on public.shortlist_overrides
  for delete to authenticated using (employer_id = (select auth.uid()));

-- shortlist_opens: same shape, keyed by job.
create policy shortlist_opens_employer_select on public.shortlist_opens
  for select to authenticated using (employer_id = (select auth.uid()));

create policy shortlist_opens_employer_insert on public.shortlist_opens
  for insert to authenticated with check (
    employer_id = (select auth.uid())
    and exists (
      select 1 from public.job_listings j
      join public.companies c on c.id = j.company_id
      where j.id = shortlist_opens.job_id and c.user_id = (select auth.uid())
    )
  );

create policy shortlist_opens_employer_update on public.shortlist_opens
  for update to authenticated
  using (employer_id = (select auth.uid()))
  with check (
    employer_id = (select auth.uid())
    and exists (
      select 1 from public.job_listings j
      join public.companies c on c.id = j.company_id
      where j.id = shortlist_opens.job_id and c.user_id = (select auth.uid())
    )
  );

create policy shortlist_opens_employer_delete on public.shortlist_opens
  for delete to authenticated using (employer_id = (select auth.uid()));
