begin;
create table public.job_views (
  event_id uuid primary key,
  job_id uuid not null references public.job_listings(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  surface text not null check (surface in ('job_page', 'job_pane'))
);
create index job_views_job_time_idx on public.job_views (job_id, viewed_at);
create index job_views_time_idx on public.job_views (viewed_at);
alter table public.job_views enable row level security;
revoke all on public.job_views from public, anon, authenticated, service_role;
grant select, insert on public.job_views to service_role;
-- Deliberately no client policies, including for listing owners.
create function public.employer_job_view_counts(p_company_id uuid, p_start timestamptz, p_end timestamptz)
returns table(job_id uuid, day date, views bigint)
language sql stable security invoker set search_path = '' as $$
  select v.job_id, (v.viewed_at at time zone 'America/Antigua')::date, count(*)
  from public.job_views v
  join public.job_listings j on j.id = v.job_id
  where j.company_id = p_company_id
    and v.viewed_at >= p_start and v.viewed_at < p_end
    and p_end > p_start and p_end - p_start <= interval '31 days'
  group by v.job_id, (v.viewed_at at time zone 'America/Antigua')::date
$$;
revoke all on function public.employer_job_view_counts(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.employer_job_view_counts(uuid,timestamptz,timestamptz) to service_role;
commit;
