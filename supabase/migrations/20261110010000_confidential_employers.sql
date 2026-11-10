-- Confidential employers.
--
-- An employer can ask not to be named. Their company row is then readable
-- only by its owner and by JobLink admins, so the public API can no longer
-- resolve job_listings.company_id to a name, logo, website or contact
-- details. Listings carry their own is_confidential flag (always derived
-- from the company) so public pages can label them without reading the
-- hidden company row.

alter table public.companies
  add column if not exists is_confidential boolean not null default false;

alter table public.job_listings
  add column if not exists is_confidential boolean not null default false;

comment on column public.companies.is_confidential is
  'Employer asked not to be named. Hides the company row from everyone but its owner and admins.';
comment on column public.job_listings.is_confidential is
  'Mirror of companies.is_confidential, maintained by triggers. Never set directly.';

-- A listing's flag always follows its company; a client cannot forge it.
create or replace function public.sync_listing_confidentiality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_confidential := coalesce(
    (select c.is_confidential from public.companies c where c.id = new.company_id),
    false
  );
  return new;
end;
$$;

revoke all on function public.sync_listing_confidentiality() from public, anon, authenticated;

drop trigger if exists job_listings_sync_confidentiality on public.job_listings;
create trigger job_listings_sync_confidentiality
  before insert or update on public.job_listings
  for each row execute function public.sync_listing_confidentiality();

-- Switching a company in or out of confidentiality carries to its listings.
create or replace function public.propagate_company_confidentiality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_confidential is distinct from old.is_confidential then
    update public.job_listings
      set is_confidential = new.is_confidential
      where company_id = new.id
        and is_confidential is distinct from new.is_confidential;
  end if;
  return null;
end;
$$;

revoke all on function public.propagate_company_confidentiality() from public, anon, authenticated;

drop trigger if exists companies_propagate_confidentiality on public.companies;
create trigger companies_propagate_confidentiality
  after update of is_confidential on public.companies
  for each row execute function public.propagate_company_confidentiality();

-- Hide confidential companies from everyone but the owner and admins.
drop policy if exists "Companies are publicly viewable" on public.companies;
create policy "Companies are publicly viewable" on public.companies
  for select
  using (
    not is_confidential
    or user_id = (select auth.uid())
    or (select public.is_admin_user())
  );

-- Who owns a company, and nothing else. Applicants and employers both need
-- this to route applications and messages, including when the company row
-- itself is hidden. It deliberately runs with its owner's rights (it is not
-- security_invoker) and exposes no name, logo or contact details.
create or replace view public.company_owners
  with (security_invoker = false)
  as select id, user_id from public.companies;

revoke all on public.company_owners from public, anon, authenticated;
grant select on public.company_owners to authenticated;

-- Messaging: both functions are SECURITY DEFINER, so they bypass the policy
-- above and must mask the employer themselves.
create or replace function public.get_inbox(p_user_id uuid, p_archived boolean default false)
returns table(conversation_id uuid, application_id uuid, last_message_text text, last_message_at timestamp with time zone, last_message_sender_id uuid, conversation_created_at timestamp with time zone, unread_count bigint, is_archived boolean, other_user_id uuid, other_display_name text, other_avatar_url text, job_title text, company_name text, application_status text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    c.application_id,
    c.last_message_text,
    c.last_message_at,
    c.last_message_sender_id,
    c.created_at AS conversation_created_at,
    COALESCE(
      (SELECT COUNT(*)
       FROM public.messages m
       WHERE m.conversation_id = c.id
         AND m.created_at > cp.last_read_at
         AND m.sender_id != p_user_id
      ), 0
    )::BIGINT AS unread_count,
    cp.is_archived,
    cp_other.user_id AS other_user_id,
    COALESCE(
      CASE WHEN co.is_confidential THEN 'Confidential employer' ELSE co.company_name END,
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      'Unknown'
    )::TEXT AS other_display_name,
    (CASE WHEN co.is_confidential THEN NULL ELSE COALESCE(
      co.logo_url,
      (SELECT sp2.avatar_url FROM public.seeker_profiles sp2 WHERE sp2.user_id = cp_other.user_id LIMIT 1),
      NULL
    ) END)::TEXT AS other_avatar_url,
    COALESCE(jl.title, 'Unknown Position')::TEXT AS job_title,
    COALESCE(
      CASE WHEN co_job.is_confidential AND co_job.user_id <> p_user_id
        THEN 'Confidential employer' ELSE co_job.company_name END,
      'Unknown Company'
    )::TEXT AS company_name,
    COALESCE(a.status, 'applied')::TEXT AS application_status
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id != p_user_id
  LEFT JOIN public.seeker_profiles sp ON sp.user_id = cp_other.user_id
  LEFT JOIN public.companies co ON co.user_id = cp_other.user_id
  LEFT JOIN public.applications a ON a.id = c.application_id
  LEFT JOIN public.job_listings jl ON jl.id = a.job_id
  LEFT JOIN public.companies co_job ON co_job.id = jl.company_id
  WHERE cp.user_id = p_user_id
    AND cp.is_archived = p_archived
    AND c.last_message_at IS NOT NULL
  ORDER BY c.last_message_at DESC;
END;
$function$;

create or replace function public.get_conversation_meta(p_user_id uuid, p_conversation_id uuid)
returns table(other_user_id uuid, other_display_name text, other_avatar_url text, other_is_online boolean, other_last_seen_at timestamp with time zone, job_title text, company_name text, application_status text, is_archived boolean, is_blocked boolean, dialogue_open boolean, seeker_user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp_other.user_id AS other_user_id,
    COALESCE(
      CASE WHEN co.is_confidential THEN 'Confidential employer' ELSE co.company_name END,
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      'Unknown'
    ) AS other_display_name,
    CASE WHEN co.is_confidential THEN NULL ELSE COALESCE(
      co.logo_url,
      sp.avatar_url
    ) END AS other_avatar_url,
    COALESCE(
      CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
        THEN up.is_online ELSE FALSE END,
      FALSE
    ) AS other_is_online,
    CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
      THEN up.last_seen_at ELSE NULL END AS other_last_seen_at,
    COALESCE(jl.title, 'Unknown Position') AS job_title,
    COALESCE(
      CASE WHEN co_job.is_confidential AND co_job.user_id <> p_user_id
        THEN 'Confidential employer' ELSE co_job.company_name END,
      'Unknown Company'
    ) AS company_name,
    COALESCE(a.status::text, 'applied') AS application_status,
    cp_me.is_archived,
    cp_me.is_blocked,
    EXISTS(
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = p_conversation_id
        AND m.sender_id = co_job.user_id
    ) AS dialogue_open,
    sp_seeker.user_id AS seeker_user_id
  FROM public.conversation_participants cp_me
  JOIN public.conversations c ON c.id = cp_me.conversation_id
  JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id != p_user_id
  LEFT JOIN public.seeker_profiles sp ON sp.user_id = cp_other.user_id
  LEFT JOIN public.companies co ON co.user_id = cp_other.user_id
  LEFT JOIN public.user_presence up ON up.user_id = cp_other.user_id
  LEFT JOIN public.user_messaging_settings ums ON ums.user_id = cp_other.user_id
  LEFT JOIN public.applications a ON a.id = c.application_id
  LEFT JOIN public.seeker_profiles sp_seeker ON sp_seeker.id = a.seeker_id
  LEFT JOIN public.job_listings jl ON jl.id = a.job_id
  LEFT JOIN public.companies co_job ON co_job.id = jl.company_id
  WHERE cp_me.user_id = p_user_id
    AND cp_me.conversation_id = p_conversation_id;
END;
$function$;
