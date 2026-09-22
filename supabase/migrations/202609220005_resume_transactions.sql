BEGIN;
CREATE OR REPLACE FUNCTION public.reserve_resume_generation(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only' USING ERRCODE = '42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resume:' || p_user_id::text,0));
 IF (SELECT count(*) FROM public.ai_usage WHERE user_id = p_user_id AND feature = 'smart_resume_preview' AND created_at > now()-interval '1 hour') >= 3 THEN RETURN false; END IF;
 INSERT INTO public.ai_usage(user_id,feature) VALUES(p_user_id,'smart_resume_preview');
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_resume_generation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resume_generation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.unlock_resume(p_user_id uuid, p_preview_created_at timestamptz, p_confirmed boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE draft jsonb; profile uuid; preview_time timestamptz;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only' USING ERRCODE = '42501'; END IF;
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmation required' USING ERRCODE = '42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_purchases WHERE user_id = p_user_id AND feature = 'smart_resume') THEN
   RAISE EXCEPTION 'Purchase required' USING ERRCODE = '42501';
 END IF;
 SELECT preview_data, created_at INTO draft, preview_time FROM public.ai_resume_previews WHERE user_id = p_user_id FOR UPDATE;
 IF draft IS NULL OR preview_time IS DISTINCT FROM p_preview_created_at THEN
   RAISE EXCEPTION 'Draft changed; review again' USING ERRCODE = '40001';
 END IF;
 IF jsonb_typeof(draft->'summary') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid draft'; END IF;
 INSERT INTO public.cv_profiles(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT id INTO STRICT profile FROM public.cv_profiles WHERE user_id = p_user_id FOR UPDATE;
 UPDATE public.cv_profiles SET summary = draft->>'summary' WHERE id = profile;
 IF jsonb_typeof(draft->'experiences') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid experiences'; END IF;
 DELETE FROM public.cv_work_experiences WHERE cv_profile_id = profile;
 INSERT INTO public.cv_work_experiences(cv_profile_id, company_name, job_title, location, start_date, end_date, is_current, description, sort_order)
 SELECT profile, r.company_name, r.job_title, r.location, r.start_date, r.end_date, r.is_current, r.description, (e.ordinality-1)::integer
 FROM jsonb_array_elements(draft->'experiences') WITH ORDINALITY e(value, ordinality)
 CROSS JOIN LATERAL jsonb_to_record(e.value) AS r(company_name text, job_title text, location text, start_date date, end_date date, is_current boolean, description text);
 IF jsonb_typeof(draft->'education') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid education'; END IF;
 DELETE FROM public.cv_education WHERE cv_profile_id = profile;
 INSERT INTO public.cv_education(cv_profile_id, institution, degree, field_of_study, start_date, end_date, is_current, sort_order)
 SELECT profile, r.institution, r.degree, r.field_of_study, r.start_date, r.end_date, r.is_current, (e.ordinality-1)::integer
 FROM jsonb_array_elements(draft->'education') WITH ORDINALITY e(value, ordinality)
 CROSS JOIN LATERAL jsonb_to_record(e.value) AS r(institution text, degree text, field_of_study text, start_date date, end_date date, is_current boolean);
 IF jsonb_typeof(draft->'languages') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid languages'; END IF;
 DELETE FROM public.cv_languages WHERE cv_profile_id = profile;
 INSERT INTO public.cv_languages(cv_profile_id, name, proficiency, sort_order)
 SELECT profile, r.name, r.proficiency, (e.ordinality-1)::integer
 FROM jsonb_array_elements(draft->'languages') WITH ORDINALITY e(value, ordinality)
 CROSS JOIN LATERAL jsonb_to_record(e.value) AS r(name text, proficiency text);
 IF jsonb_typeof(draft->'projects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid projects'; END IF;
 DELETE FROM public.cv_projects WHERE cv_profile_id = profile;
 INSERT INTO public.cv_projects(cv_profile_id, title, role, description, sort_order)
 SELECT profile, r.title, r.role, r.description, (e.ordinality-1)::integer
 FROM jsonb_array_elements(draft->'projects') WITH ORDINALITY e(value, ordinality)
 CROSS JOIN LATERAL jsonb_to_record(e.value) AS r(title text, role text, description text);
 IF jsonb_typeof(draft->'volunteer') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid volunteer'; END IF;
 DELETE FROM public.cv_volunteer WHERE cv_profile_id = profile;
 INSERT INTO public.cv_volunteer(cv_profile_id, organization, role, description, sort_order)
 SELECT profile, r.organization, r.role, r.description, (e.ordinality-1)::integer
 FROM jsonb_array_elements(draft->'volunteer') WITH ORDINALITY e(value, ordinality)
 CROSS JOIN LATERAL jsonb_to_record(e.value) AS r(organization text, role text, description text);
 IF jsonb_typeof(draft->'skills') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid skills'; END IF;
 DELETE FROM public.cv_skills WHERE cv_profile_id = profile;
 INSERT INTO public.cv_skills(cv_profile_id,name,sort_order)
 SELECT profile, value, (ordinality-1)::integer FROM jsonb_array_elements_text(draft->'skills') WITH ORDINALITY;
 UPDATE public.cv_profiles SET completion_percentage =
   (CASE WHEN coalesce(trim(job_title),'') <> '' THEN 15 ELSE 0 END) +
   (CASE WHEN coalesce(trim(summary),'') <> '' THEN 15 ELSE 0 END) +
   (CASE WHEN jsonb_array_length(draft->'experiences') > 0 THEN 25 ELSE 0 END) +
   (CASE WHEN jsonb_array_length(draft->'education') > 0 THEN 20 ELSE 0 END) +
   (CASE WHEN jsonb_array_length(draft->'skills') >= 3 THEN 15 ELSE 0 END) +
   (CASE WHEN EXISTS(SELECT 1 FROM public.cv_awards WHERE cv_profile_id=profile) OR EXISTS(SELECT 1 FROM public.cv_certifications WHERE cv_profile_id=profile) THEN 10 ELSE 0 END)
 WHERE id=profile;
 -- Deleting the draft is part of the same transaction as all section replacements.
 DELETE FROM public.ai_resume_previews WHERE user_id = p_user_id;
 RETURN profile;
END; $$;
REVOKE ALL ON FUNCTION public.unlock_resume(uuid,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_resume(uuid,timestamptz,boolean) TO service_role;
COMMIT;
