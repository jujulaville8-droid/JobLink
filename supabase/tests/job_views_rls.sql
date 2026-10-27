-- Run after the migration. Privilege and RLS checks do not depend on fixture data.
do $$
declare r text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.job_views'::regclass) then
    raise exception 'job_views RLS must be enabled';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_views') then
    raise exception 'job_views must have no client policies';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.job_views', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'raw event access granted to %', r;
    end if;
    if has_function_privilege(r, 'public.employer_job_view_counts(uuid,timestamptz,timestamptz)', 'EXECUTE') then
      raise exception 'aggregate access granted to %', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.employer_job_view_counts(uuid,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'service_role must execute view aggregates';
  end if;
  if not has_table_privilege('service_role', 'public.job_views', 'SELECT')
     or not has_table_privilege('service_role', 'public.job_views', 'INSERT')
     or has_table_privilege('service_role', 'public.job_views', 'UPDATE,DELETE') then
    raise exception 'unexpected service event privileges';
  end if;
end $$;
