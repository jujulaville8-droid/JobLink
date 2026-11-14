-- Unapplied. Employer-only advisory text must not live on seeker-readable applications.
create table public.application_fit_verdicts (
  application_id uuid primary key references public.applications(id) on delete cascade,
  verdict text not null check (verdict in ('good_fit', 'not_a_fit', 'not_enough_information', 'unavailable')),
  verdict_text text not null check (char_length(verdict_text) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.application_fit_verdicts enable row level security;
revoke all on public.application_fit_verdicts from public, anon, authenticated;
grant select on public.application_fit_verdicts to authenticated;
grant all on public.application_fit_verdicts to service_role;
create policy application_fit_verdicts_employer_read on public.application_fit_verdicts
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.job_listings j on j.id = a.job_id
      join public.companies c on c.id = j.company_id
      where a.id = application_fit_verdicts.application_id and c.user_id = (select auth.uid())
    )
  );
create policy application_fit_verdicts_admin_read on public.application_fit_verdicts
  for select to authenticated using ((select public.is_admin_user()));
