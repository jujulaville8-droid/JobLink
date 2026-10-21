-- UNAPPLIED REVIEW DRAFT. No live changes, credentials, provisioning, or activation.
-- Apply only to a disposable synthetic database. Runtime AND database gates default OFF.
BEGIN;
CREATE SCHEMA employer_delivery;
REVOKE ALL ON SCHEMA employer_delivery FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE employer_delivery.configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO employer_delivery.configuration DEFAULT VALUES;
CREATE TABLE employer_delivery.capture_requests(application_id uuid PRIMARY KEY, applicant_id uuid NOT NULL, capture jsonb);
ALTER TABLE public.applications ADD COLUMN employer_delivery_path text NOT NULL DEFAULT 'legacy'
  CHECK (employer_delivery_path IN ('legacy','screening'));
CREATE TABLE employer_delivery.rubrics (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL, company_id uuid NOT NULL,
  owner_id uuid NOT NULL, approved_by uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous_version uuid, rubric_json jsonb NOT NULL,
  UNIQUE(job_id, version_id)
);
CREATE TABLE employer_delivery.rubric_heads (job_id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES employer_delivery.rubrics(version_id));
CREATE TABLE employer_delivery.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately NO cascading FKs: deletion redacts payload but must not erase send evidence.
  application_id uuid NOT NULL UNIQUE, job_id uuid NOT NULL, company_id uuid NOT NULL,
  account_id uuid NOT NULL, applicant_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'employer-forward' CHECK (purpose = 'employer-forward'),
  delivery_path text NOT NULL CHECK (delivery_path IN ('legacy','screening')),
  submitted_at timestamptz NOT NULL, processing_deadline timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('inactive','pending','claimed','ready','sending','accepted','uncertain','blocked','cancelled')),
  baseline_json text, baseline_sha256 text NOT NULL,
  snapshot_json text, snapshot_sha256 text, materials_finalized boolean NOT NULL DEFAULT false, rubric_version_id uuid, rubric_json jsonb,
  -- Optional document quality is pinned to the captured attachment, not the job rubric.
  quality_json text, quality_sha256 text,
  expected_to text, expected_reply_to text, expected_from text,
  attachment jsonb, resume_version_id text, resume_sha256 text,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
  lease uuid, lease_expires_at timestamptz,
  frozen_email_json text, payload_sha256 text,
  first_send_at timestamptz, provider_id text, accepted_at timestamptz,
  last_error_code text, redacted_at timestamptz,
  UNIQUE(account_id, application_id, purpose),
  CHECK ((snapshot_json IS NULL) = (snapshot_sha256 IS NULL)),
  CHECK ((quality_json IS NULL) = (quality_sha256 IS NULL)),
  CHECK (attempts = 0 OR first_send_at IS NOT NULL),
  CHECK (baseline_json IS NOT NULL OR redacted_at IS NOT NULL)
);
CREATE INDEX outbox_due ON employer_delivery.outbox(next_attempt_at,id)
  WHERE state IN ('pending','claimed','ready','sending');
CREATE INDEX outbox_expired_sending ON employer_delivery.outbox(lease_expires_at) WHERE state='sending';
CREATE TABLE employer_delivery.reconciliation (
  evidence_id text PRIMARY KEY, outbox_id uuid NOT NULL REFERENCES employer_delivery.outbox(id),
  payload_sha256 text NOT NULL, outcome text NOT NULL CHECK (outcome IN ('accepted','not_sent')),
  provider_id text, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION employer_delivery.valid_mailbox(v text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE parts text[]; local_part text; label text;
BEGIN
  IF v IS NULL OR length(v)>254 OR v<>lower(btrim(v))
    OR v ~* '^(admin-company-|import\+)[^@]*@joblinkantigua\.com$' THEN RETURN false; END IF;
  parts := string_to_array(v,'@');
  IF cardinality(parts)<>2 THEN RETURN false; END IF;
  local_part := parts[1];
  IF length(local_part) NOT BETWEEN 1 AND 64 OR local_part LIKE '.%' OR local_part LIKE '%.'
    OR strpos(local_part,'..')>0 OR local_part !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+$' THEN RETURN false; END IF;
  parts := string_to_array(parts[2],'.');
  IF cardinality(parts)<2 THEN RETURN false; END IF;
  FOREACH label IN ARRAY parts LOOP
    IF label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION employer_delivery.valid_attachment(a jsonb, applicant uuid, application uuid, digest text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN a IS NOT NULL AND jsonb_typeof(a)='object' AND
    (SELECT count(*) FROM jsonb_object_keys(a))=4 AND
    a->>'sha256'=digest AND digest ~ '^[a-f0-9]{64}$' AND
    a->>'storagePath' LIKE applicant::text || '/' || application::text || '/%' AND
    length(a->>'storagePath') BETWEEN 1 AND 1024 AND strpos(a->>'storagePath','..')=0 AND strpos(a->>'storagePath','://')=0 AND
    length(a->>'filename') BETWEEN 1 AND 255 AND a->>'filename' !~ E'[\\\\/\\r\\n]' AND
    (a->>'bytes')::bigint BETWEEN 1 AND 5242880;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION employer_delivery.protect_outbox() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.application_id,NEW.job_id,NEW.company_id,NEW.account_id,NEW.applicant_id,NEW.delivery_path,NEW.submitted_at,NEW.processing_deadline,NEW.baseline_sha256)
    IS DISTINCT FROM (OLD.application_id,OLD.job_id,OLD.company_id,OLD.account_id,OLD.applicant_id,OLD.delivery_path,OLD.submitted_at,OLD.processing_deadline,OLD.baseline_sha256)
    THEN RAISE EXCEPTION 'OUTBOX_IMMUTABLE'; END IF;
  IF NEW.redacted_at IS NULL AND (NEW.baseline_json,NEW.expected_to,NEW.expected_reply_to,NEW.expected_from,NEW.attachment,NEW.resume_version_id,NEW.resume_sha256,NEW.rubric_version_id,NEW.rubric_json)
    IS DISTINCT FROM (OLD.baseline_json,OLD.expected_to,OLD.expected_reply_to,OLD.expected_from,OLD.attachment,OLD.resume_version_id,OLD.resume_sha256,OLD.rubric_version_id,OLD.rubric_json)
    THEN RAISE EXCEPTION 'BASELINE_IMMUTABLE'; END IF;
  IF OLD.frozen_email_json IS NOT NULL AND NEW.redacted_at IS NULL AND
    (NEW.frozen_email_json,NEW.payload_sha256) IS DISTINCT FROM (OLD.frozen_email_json,OLD.payload_sha256)
    THEN RAISE EXCEPTION 'PAYLOAD_IMMUTABLE'; END IF;
  IF OLD.redacted_at IS NOT NULL AND (NEW.redacted_at IS NULL OR NEW.baseline_json IS NOT NULL OR NEW.frozen_email_json IS NOT NULL OR NEW.snapshot_json IS NOT NULL
    OR NEW.quality_json IS NOT NULL OR NEW.quality_sha256 IS NOT NULL)
    THEN RAISE EXCEPTION 'TOMBSTONE_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_outbox BEFORE UPDATE ON employer_delivery.outbox FOR EACH ROW EXECUTE FUNCTION employer_delivery.protect_outbox();
CREATE FUNCTION employer_delivery.capture_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.job_listings; c public.companies; owner public.users; s public.seeker_profiles;
  applicant public.users; capture jsonb; b text; route text; reply text; rv employer_delivery.rubrics; selected boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.employer_delivery_path IS DISTINCT FROM OLD.employer_delivery_path THEN RAISE EXCEPTION 'DELIVERY_PATH_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO j FROM public.job_listings WHERE id=NEW.job_id;
  SELECT * INTO c FROM public.companies WHERE id=j.company_id;
  SELECT * INTO owner FROM public.users WHERE id=c.user_id;
  SELECT * INTO s FROM public.seeker_profiles WHERE id=NEW.seeker_id;
  SELECT * INTO applicant FROM public.users WHERE id=s.user_id;
  IF j.id IS NULL OR c.id IS NULL OR s.id IS NULL OR applicant.id IS NULL THEN RAISE EXCEPTION 'OUTBOX_IDENTITY_MISSING'; END IF;
  -- Only the privileged apply RPC may request this path; direct INSERT is legacy forever.
  DELETE FROM employer_delivery.capture_requests WHERE application_id=NEW.id AND applicant_id=applicant.id RETURNING capture_requests.capture INTO capture;
  selected := FOUND AND (SELECT enabled FROM employer_delivery.configuration WHERE singleton);
  NEW.employer_delivery_path := CASE WHEN selected THEN 'screening' ELSE 'legacy' END;
  NEW.applied_at := clock_timestamp();
  IF NOT selected THEN capture:=NULL; END IF;
  IF capture IS NOT NULL AND (NOT coalesce(employer_delivery.valid_attachment(capture->'attachment',applicant.id,NEW.id,capture->>'sha256'),false)
    OR nullif(capture->>'versionId','') IS NULL
    OR capture->'attachment'->>'storagePath' IS DISTINCT FROM applicant.id::text||'/'||NEW.id::text||'/'||(capture->>'versionId')||'.pdf') THEN RAISE EXCEPTION 'INVALID_CAPTURE'; END IF;
  route := coalesce(nullif(lower(btrim(c.contact_email)),''),CASE WHEN owner.email_verified THEN lower(btrim(owner.email)) END);
  reply := CASE WHEN employer_delivery.valid_mailbox(lower(btrim(applicant.email))) THEN lower(btrim(applicant.email)) ELSE NULL END;
  SELECT r.* INTO rv FROM employer_delivery.rubric_heads h JOIN employer_delivery.rubrics r ON r.version_id=h.version_id
    WHERE h.job_id=j.id AND r.company_id=c.id AND r.owner_id=c.user_id;
  b := jsonb_build_object('applicationId',NEW.id,'jobId',j.id,'companyId',c.id,
    'createdAt',floor(extract(epoch FROM NEW.applied_at)*1000)::bigint,
    'from','JobLink <notifications@joblinkantigua.com>','to',coalesce(route,''),'replyTo',reply,
    'applicantName',left(coalesce(nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),''),'Applicant'),200),
    'applicantEmail',reply,'applicantPhone',nullif(left(s.phone,80),''),
    'jobTitle',left(coalesce(nullif(btrim(j.title),''),'Job opening'),1000),'companyName',left(coalesce(nullif(btrim(c.company_name),''),'Employer'),1000),
    'coverLetterExcerpt',left(coalesce(NEW.cover_letter_text,''),1500),'reviewPath',CASE WHEN owner.email_verified AND route=lower(btrim(owner.email)) THEN '/my-listings/'||j.id::text||'/applicants' ELSE NULL END,
    'resumeVersionId',capture->>'versionId','resumeSha256',capture->>'sha256',
    'attachments',CASE WHEN capture IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(capture->'attachment') END)::text;
  INSERT INTO employer_delivery.outbox(application_id,job_id,company_id,account_id,applicant_id,delivery_path,
    submitted_at,processing_deadline,state,baseline_json,baseline_sha256,expected_to,expected_reply_to,expected_from,
    attachment,resume_version_id,resume_sha256,rubric_version_id,rubric_json,next_attempt_at)
  VALUES(NEW.id,j.id,c.id,c.user_id,applicant.id,NEW.employer_delivery_path,NEW.applied_at,NEW.applied_at+interval '2 minutes',
    CASE WHEN selected THEN 'pending' ELSE 'inactive' END,b,encode(sha256(convert_to(b,'UTF8')),'hex'),route,reply,
    'JobLink <notifications@joblinkantigua.com>',capture->'attachment',capture->>'versionId',capture->>'sha256',rv.version_id,rv.rubric_json,NEW.applied_at+interval '2 minutes');
  RETURN NEW;
END $$;
CREATE TRIGGER employer_outbox_capture BEFORE INSERT OR UPDATE OF employer_delivery_path ON public.applications
  FOR EACH ROW EXECUTE FUNCTION employer_delivery.capture_application();
CREATE TABLE employer_delivery.capture_cleanup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid UNIQUE REFERENCES employer_delivery.outbox(id),
 application_id uuid NOT NULL, storage_path text UNIQUE, capture_key text NOT NULL UNIQUE, sha256 text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','deleted')),
 next_attempt_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 lease uuid, lease_expires_at timestamptz, deleted_at timestamptz
);
CREATE FUNCTION employer_delivery.redact_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Read the final send state only AFTER obtaining the row lock, including concurrent start_send.
  PERFORM 1 FROM employer_delivery.outbox WHERE application_id=OLD.id FOR UPDATE;
  INSERT INTO employer_delivery.capture_cleanup(outbox_id,application_id,storage_path,capture_key,sha256,next_attempt_at)
  SELECT id,application_id,attachment->>'storagePath',encode(sha256(convert_to(attachment->>'storagePath','UTF8')),'hex'),attachment->>'sha256',
    CASE WHEN state IN ('sending','uncertain') AND first_send_at IS NOT NULL
      THEN greatest(clock_timestamp(),first_send_at+interval '24 hours') ELSE clock_timestamp() END
  FROM employer_delivery.outbox WHERE application_id=OLD.id AND attachment IS NOT NULL
  ON CONFLICT(capture_key) DO UPDATE SET outbox_id=excluded.outbox_id,next_attempt_at=excluded.next_attempt_at,
    state='pending',lease=NULL,lease_expires_at=NULL;
  UPDATE employer_delivery.outbox SET
    state=CASE WHEN state='accepted' THEN 'accepted' WHEN attempts>0 AND state IN ('sending','uncertain') THEN 'uncertain' ELSE 'cancelled' END,
    redacted_at=clock_timestamp(),baseline_json=NULL,snapshot_json=NULL,snapshot_sha256=NULL,quality_json=NULL,quality_sha256=NULL,rubric_json=NULL,
    expected_to=NULL,expected_reply_to=NULL,expected_from=NULL,attachment=NULL,resume_version_id=NULL,resume_sha256=NULL,
    frozen_email_json=NULL,lease=NULL,lease_expires_at=NULL,last_error_code='APPLICATION_DELETED'
  WHERE application_id=OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER employer_outbox_redact BEFORE DELETE ON public.applications FOR EACH ROW EXECUTE FUNCTION employer_delivery.redact_application();

CREATE FUNCTION public.employer_screening_configuration() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('enabled',enabled) FROM employer_delivery.configuration WHERE singleton;
$$;
-- Service route must verify the current authenticated user before passing applicant identity.
-- Never grant this RPC to authenticated/anon: p_applicant_user_id is not client authorization.
CREATE FUNCTION public.employer_screening_apply(p_application_id uuid,p_job_id uuid,p_applicant_user_id uuid,p_cover_letter_text text,
 p_resume_version_id text DEFAULT NULL,p_resume_sha256 text DEFAULT NULL,p_attachment jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.applications; s public.seeker_profiles; o employer_delivery.outbox; c jsonb;
BEGIN
  SELECT sp.* INTO s FROM public.seeker_profiles sp JOIN public.users u ON u.id=sp.user_id
    WHERE sp.user_id=p_applicant_user_id AND u.role='seeker' AND NOT u.is_banned;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.job_listings WHERE id=p_job_id AND status='active')
    OR p_application_id IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_AUTHORIZED'; END IF;
  -- Serialize concurrent UUID retries without serializing unrelated applications.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_application_id::text,0));
  -- Explicit retry with the same application UUID never creates another delivery.
  SELECT * INTO a FROM public.applications WHERE id=p_application_id;
  IF FOUND THEN
    IF a.job_id<>p_job_id OR a.seeker_id<>s.id THEN RAISE EXCEPTION 'APPLICATION_ID_CONFLICT'; END IF;
  ELSE
    IF p_attachment IS NOT NULL THEN
      IF p_resume_version_id IS NULL OR p_resume_version_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR p_attachment->>'storagePath' IS DISTINCT FROM p_applicant_user_id::text||'/'||p_application_id::text||'/'||p_resume_version_id||'.pdf' OR NOT coalesce(employer_delivery.valid_attachment(p_attachment,p_applicant_user_id,p_application_id,p_resume_sha256),false)
        THEN RAISE EXCEPTION 'INVALID_CAPTURE'; END IF;
      PERFORM 1 FROM employer_delivery.capture_cleanup WHERE application_id=p_application_id AND storage_path=p_attachment->>'storagePath'
        AND sha256=p_resume_sha256 AND state='pending' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'CAPTURE_NOT_REGISTERED'; END IF;
      c:=jsonb_build_object('versionId',p_resume_version_id,'sha256',p_resume_sha256,'attachment',p_attachment);
    ELSIF p_resume_version_id IS NOT NULL OR p_resume_sha256 IS NOT NULL THEN RAISE EXCEPTION 'INVALID_CAPTURE'; END IF;
    INSERT INTO employer_delivery.capture_requests(application_id,applicant_id,capture) VALUES(p_application_id,p_applicant_user_id,c);
    INSERT INTO public.applications(id,job_id,seeker_id,cover_letter_text)
      VALUES(p_application_id,p_job_id,s.id,p_cover_letter_text) RETURNING * INTO a;

  END IF;
  SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=a.id;
  RETURN jsonb_build_object('application',to_jsonb(a),'employer_delivery_path',a.employer_delivery_path,
    'baseline_json',o.baseline_json,'baseline_sha256',o.baseline_sha256,'rubric_json',o.rubric_json,'rubric_version_id',o.rubric_version_id);
END $$;
CREATE FUNCTION employer_delivery.protect_rubric() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'RUBRIC_IMMUTABLE'; END $$;
CREATE TRIGGER protect_rubric BEFORE UPDATE OR DELETE ON employer_delivery.rubrics FOR EACH ROW EXECUTE FUNCTION employer_delivery.protect_rubric();
-- Only the authenticated, verified owning employer's service route may call this RPC.
-- The repeated DB ownership/verified/banned checks close stale route authorization races.
CREATE FUNCTION public.employer_screening_approve_rubric(p_job_id uuid,p_owner_user_id uuid,p_expected_version text,p_criteria jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.job_listings; c public.companies; current_version uuid; v uuid:=gen_random_uuid(); r jsonb;
BEGIN
  SELECT * INTO j FROM public.job_listings WHERE id=p_job_id FOR UPDATE;
  SELECT * INTO c FROM public.companies WHERE id=j.company_id FOR SHARE;
  IF c.user_id IS DISTINCT FROM p_owner_user_id OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_user_id AND role='employer' AND email_verified AND NOT is_banned)
    THEN RAISE EXCEPTION 'RUBRIC_NOT_AUTHORIZED'; END IF;
  SELECT version_id INTO current_version FROM employer_delivery.rubric_heads WHERE job_id=j.id;
  IF current_version::text IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'RUBRIC_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_criteria)<>'array' OR jsonb_array_length(p_criteria) NOT BETWEEN 1 AND 20
    OR (SELECT coalesce(sum((x->>'weight')::integer),0) FROM jsonb_array_elements(p_criteria) x)<>100
    OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_criteria) x)<>jsonb_array_length(p_criteria)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria) x WHERE
      jsonb_typeof(x)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(x))<>5
      OR coalesce(x->>'id','') !~ '^[a-z0-9_-]{1,60}$' OR length(btrim(coalesce(x->>'label',''))) NOT BETWEEN 1 AND 1000
      OR coalesce(x->>'category','') NOT IN ('skill','relevant_experience','job_certification')
      OR jsonb_typeof(x->'weight') IS DISTINCT FROM 'number' OR coalesce(x->>'weight','') !~ '^[0-9]+$'
      OR (x->>'weight')::integer NOT BETWEEN 1 AND 100 OR jsonb_typeof(x->'verificationRequired') IS DISTINCT FROM 'boolean')
    THEN RAISE EXCEPTION 'INVALID_RUBRIC'; END IF;
  r:=jsonb_build_object('versionId',v,'jobId',j.id,'approved',true,'criteria',p_criteria);
  INSERT INTO employer_delivery.rubrics(version_id,job_id,company_id,owner_id,approved_by,previous_version,rubric_json)
    VALUES(v,j.id,c.id,c.user_id,p_owner_user_id,current_version,r);
  INSERT INTO employer_delivery.rubric_heads VALUES(j.id,v) ON CONFLICT(job_id) DO UPDATE SET version_id=excluded.version_id;
  RETURN r;
END $$;
CREATE FUNCTION public.employer_screening_get_rubric(p_job_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT r.rubric_json FROM employer_delivery.rubric_heads h JOIN employer_delivery.rubrics r ON r.version_id=h.version_id
 JOIN public.job_listings j ON j.id=h.job_id JOIN public.companies c ON c.id=j.company_id
 WHERE j.id=p_job_id AND c.id=r.company_id AND c.user_id=r.owner_id;
$$;
CREATE FUNCTION public.employer_screening_register_materials(p_application_id uuid,p_applicant_user_id uuid,p_snapshot_json text,p_snapshot_sha256 text,
 p_quality_json text DEFAULT NULL,p_quality_sha256 text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; s jsonb; q jsonb;
  v_snapshot_json text; v_snapshot_sha256 text; v_quality_json text; v_quality_sha256 text;
  snapshot_valid boolean:=false;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=p_application_id FOR UPDATE;
  IF NOT FOUND OR o.applicant_id IS DISTINCT FROM p_applicant_user_id OR o.state<>'pending' OR o.attempts<>0 OR o.redacted_at IS NOT NULL
    OR clock_timestamp()>=o.processing_deadline THEN RETURN false; END IF;
  -- Validate each optional channel independently. Malformed quality is discarded; it
  -- never rejects a trusted baseline or valid job-specific screening material.
  IF p_quality_json IS NOT NULL AND p_quality_sha256 IS NOT NULL AND octet_length(p_quality_json)<=40960
    AND p_quality_sha256=encode(sha256(convert_to(p_quality_json,'UTF8')),'hex')
    AND o.resume_version_id IS NOT NULL AND o.resume_sha256 IS NOT NULL
    AND coalesce(employer_delivery.valid_attachment(o.attachment,o.applicant_id,o.application_id,o.resume_sha256),false)
    AND o.attachment->>'storagePath'=o.applicant_id::text||'/'||o.application_id::text||'/'||o.resume_version_id||'.pdf' THEN
    BEGIN
      q:=p_quality_json::jsonb;
      IF jsonb_typeof(q)='object' AND q->>'status'='assessed' AND q->>'kind'='resume_document_quality'
        AND q->>'rubricVersion'='resume-document-quality-v1' AND q->>'sourceSha256'=o.resume_sha256 THEN
        v_quality_json:=p_quality_json; v_quality_sha256:=p_quality_sha256;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_quality_json:=NULL; v_quality_sha256:=NULL;
    END;
  END IF;
  IF p_snapshot_json IS NULL AND p_snapshot_sha256 IS NULL THEN snapshot_valid:=true;
  ELSIF o.rubric_json IS NOT NULL AND o.attachment IS NOT NULL AND p_snapshot_json IS NOT NULL AND p_snapshot_sha256 IS NOT NULL THEN
    BEGIN
      s:=p_snapshot_json::jsonb;
      IF p_snapshot_sha256=encode(sha256(convert_to(p_snapshot_json,'UTF8')),'hex')
        AND s->>'applicationId'=o.application_id::text AND s->>'jobId'=o.job_id::text
        AND s->>'companyId'=o.company_id::text AND s->'createdAt'=(o.baseline_json::jsonb)->'createdAt'
        AND s->'rubric'=o.rubric_json AND s->'resume'->>'versionId'=o.resume_version_id
        AND s->'resume'->>'sha256'=o.resume_sha256 THEN
        v_snapshot_json:=p_snapshot_json; v_snapshot_sha256:=p_snapshot_sha256; snapshot_valid:=true;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_snapshot_json:=NULL; v_snapshot_sha256:=NULL;
    END;
  END IF;
  -- Retain the previous rejected-snapshot behavior when no independent material
  -- can be saved. Valid quality must still survive a missing/unapproved rubric or
  -- corrupt scoring snapshot, with baseline forwarding released immediately.
  IF NOT snapshot_valid AND v_quality_json IS NULL THEN RETURN false; END IF;
  IF o.materials_finalized THEN
    RETURN o.snapshot_json IS NOT DISTINCT FROM v_snapshot_json AND o.snapshot_sha256 IS NOT DISTINCT FROM v_snapshot_sha256
      AND o.quality_json IS NOT DISTINCT FROM v_quality_json AND o.quality_sha256 IS NOT DISTINCT FROM v_quality_sha256;
  END IF;
  UPDATE employer_delivery.outbox SET snapshot_json=v_snapshot_json,
    snapshot_sha256=v_snapshot_sha256,
    quality_json=v_quality_json,quality_sha256=v_quality_sha256,
    materials_finalized=true,next_attempt_at=clock_timestamp() WHERE id=o.id;
  RETURN true;
END $$;

CREATE FUNCTION employer_delivery.authorized(o employer_delivery.outbox) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT o.redacted_at IS NULL AND o.delivery_path='screening' AND EXISTS (
 SELECT 1 FROM public.applications a JOIN public.job_listings j ON j.id=a.job_id
 JOIN public.companies c ON c.id=j.company_id JOIN public.users owner ON owner.id=c.user_id
 JOIN public.seeker_profiles s ON s.id=a.seeker_id JOIN public.users applicant ON applicant.id=s.user_id
 WHERE a.id=o.application_id AND a.employer_delivery_path='screening' AND j.id=o.job_id AND c.id=o.company_id
 AND c.user_id=o.account_id AND s.user_id=o.applicant_id
 AND owner.role='employer' AND NOT owner.is_banned AND NOT applicant.is_banned
 AND o.expected_to=coalesce(nullif(lower(btrim(c.contact_email)),''),CASE WHEN owner.email_verified THEN lower(btrim(owner.email)) END)
 AND employer_delivery.valid_mailbox(o.expected_to)
 AND (o.expected_reply_to IS NULL OR employer_delivery.valid_mailbox(o.expected_reply_to))
 AND o.expected_from='JobLink <notifications@joblinkantigua.com>');
$$;
CREATE FUNCTION employer_delivery.baseline_valid(o employer_delivery.outbox) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE b jsonb;
BEGIN
  IF o.baseline_json IS NULL OR o.baseline_sha256 IS DISTINCT FROM encode(sha256(convert_to(o.baseline_json,'UTF8')),'hex') THEN RETURN false; END IF;
  b:=o.baseline_json::jsonb;
  RETURN b->>'applicationId'=o.application_id::text AND b->>'jobId'=o.job_id::text AND b->>'companyId'=o.company_id::text
    AND b->>'from'=o.expected_from AND b->>'to'=o.expected_to AND b->>'replyTo' IS NOT DISTINCT FROM o.expected_reply_to
    AND b->>'resumeVersionId' IS NOT DISTINCT FROM o.resume_version_id AND b->>'resumeSha256' IS NOT DISTINCT FROM o.resume_sha256
    AND b->'attachments'=CASE WHEN o.attachment IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(o.attachment) END;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION public.employer_outbox_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; t timestamptz;
BEGIN
  LOOP
    t:=clock_timestamp();
    -- Never bulk UPDATE before SKIP LOCKED: a locked poison/send row must not stall unrelated work.
    SELECT * INTO o FROM employer_delivery.outbox WHERE
      (state='pending' AND next_attempt_at<=t) OR (state IN ('claimed','ready','sending') AND lease_expires_at<=t)
      ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF o.state='sending' THEN
      UPDATE employer_delivery.outbox SET state='uncertain',last_error_code='LEASE_EXPIRED_SENDING',lease=NULL,lease_expires_at=NULL WHERE id=o.id;
      CONTINUE;
    END IF;
    IF o.attempts>=4 OR o.first_send_at+interval '23 hours'<=t OR NOT coalesce(employer_delivery.authorized(o),false)
      OR NOT coalesce(employer_delivery.baseline_valid(o),false)
      OR (o.frozen_email_json IS NULL) IS DISTINCT FROM (o.payload_sha256 IS NULL)
      OR (o.frozen_email_json IS NOT NULL AND o.payload_sha256 IS DISTINCT FROM encode(sha256(convert_to(o.frozen_email_json,'UTF8')),'hex')) THEN
      UPDATE employer_delivery.outbox SET state='blocked',last_error_code='CLAIM_GATE_REJECTED',lease=NULL,lease_expires_at=NULL WHERE id=o.id;
      CONTINUE;
    END IF;
    UPDATE employer_delivery.outbox SET state='claimed',lease=gen_random_uuid(),lease_expires_at=least(t+interval '90 seconds',greatest(o.processing_deadline-interval '20 seconds',t+interval '10 seconds'))
      WHERE id=o.id RETURNING * INTO o;
    RETURN jsonb_build_object('id',o.id,'application_id',o.application_id,'job_id',o.job_id,'company_id',o.company_id,
      'baseline_json',o.baseline_json,'baseline_sha256',o.baseline_sha256,'snapshot_json',o.snapshot_json,'snapshot_sha256',o.snapshot_sha256,
      'quality_json',o.quality_json,'quality_sha256',o.quality_sha256,
      'email_json',o.frozen_email_json,'payload_sha256',o.payload_sha256,'attempts',o.attempts,'first_send_at',o.first_send_at,
      'processing_deadline',o.processing_deadline,'lease',o.lease);
  END LOOP;
END $$;
-- Read-only operator metadata. Route must independently verify the authenticated administrator.
CREATE FUNCTION public.employer_outbox_status(p_application_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('state',state,'attempts',attempts,'first_send_at',first_send_at,'accepted_at',accepted_at,
   'next_attempt_at',next_attempt_at,'last_error_code',last_error_code)
 FROM employer_delivery.outbox WHERE application_id=p_application_id;
$$;
CREATE FUNCTION public.employer_outbox_quarantine(p_id uuid,p_lease uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_code IS DISTINCT FROM 'INVALID_PERSISTED_PAYLOAD' THEN RETURN false; END IF;
 UPDATE employer_delivery.outbox SET state='blocked',last_error_code=p_code,lease=NULL,lease_expires_at=NULL
 WHERE id=p_id AND lease=p_lease AND state IN ('claimed','ready') AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;
CREATE FUNCTION public.employer_outbox_freeze(p_id uuid,p_lease uuid,p_content_json text,p_digest text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; e jsonb;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR o.state NOT IN ('claimed','ready') OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease
    OR o.lease_expires_at IS NULL OR o.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
  BEGIN e:=p_content_json::jsonb; EXCEPTION WHEN OTHERS THEN RETURN false; END;
  IF p_digest IS DISTINCT FROM encode(sha256(convert_to(p_content_json,'UTF8')),'hex')
    OR e->>'from' IS DISTINCT FROM o.expected_from OR e->>'to' IS DISTINCT FROM o.expected_to
    OR e->>'replyTo' IS DISTINCT FROM o.expected_reply_to OR e->'attachments' IS DISTINCT FROM (CASE WHEN o.attachment IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(o.attachment) END)
    OR e->>'resumeVersionId' IS DISTINCT FROM o.resume_version_id OR e->>'resumeSha256' IS DISTINCT FROM o.resume_sha256
    OR NOT coalesce(employer_delivery.baseline_valid(o),false) OR NOT coalesce(employer_delivery.authorized(o),false)
    THEN RETURN false; END IF;
  IF o.frozen_email_json IS NOT NULL THEN RETURN o.frozen_email_json=p_content_json AND o.payload_sha256=p_digest; END IF;
  UPDATE employer_delivery.outbox SET frozen_email_json=p_content_json,payload_sha256=p_digest,state='ready'
    WHERE id=o.id AND lease_expires_at>clock_timestamp();
  RETURN FOUND;
END $$;
CREATE FUNCTION public.employer_outbox_start_send(p_id uuid,p_lease uuid,p_digest text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; t timestamptz;
BEGIN
  -- Deletion may race external dispatch after this transaction; the tombstone preserves the uncertain outcome.
  SELECT * INTO o FROM employer_delivery.outbox WHERE id=p_id FOR UPDATE;
  t:=clock_timestamp();
  IF NOT FOUND OR o.state NOT IN ('claimed','ready') OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease
    OR o.lease_expires_at IS NULL OR o.lease_expires_at<=t THEN RETURN false; END IF;
  IF o.attempts>=4 OR o.first_send_at+interval '23 hours'<=t OR NOT coalesce(employer_delivery.authorized(o),false)
    OR o.frozen_email_json IS NULL OR o.payload_sha256 IS DISTINCT FROM p_digest
    OR o.payload_sha256 IS DISTINCT FROM encode(sha256(convert_to(o.frozen_email_json,'UTF8')),'hex') THEN
    UPDATE employer_delivery.outbox SET state='blocked',last_error_code='SEND_GATE_REJECTED',lease=NULL,lease_expires_at=NULL WHERE id=o.id;
    RETURN false;
  END IF;
  UPDATE employer_delivery.outbox SET state='sending',attempts=attempts+1,first_send_at=coalesce(first_send_at,t),lease_expires_at=t+interval '60 seconds'
    WHERE id=o.id AND lease_expires_at>clock_timestamp();
  RETURN FOUND;
END $$;
CREATE FUNCTION public.employer_outbox_finish(p_id uuid,p_lease uuid,p_kind text,p_provider_id text,p_retry_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; t timestamptz;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE id=p_id FOR UPDATE;
  t:=clock_timestamp();
  IF NOT FOUND OR o.state<>'sending' OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease
    OR o.lease_expires_at IS NULL OR o.lease_expires_at<=t THEN RETURN false; END IF;
  IF p_kind='accepted' AND p_provider_id IS NOT NULL AND length(p_provider_id) BETWEEN 1 AND 255 THEN
    UPDATE employer_delivery.outbox SET state='accepted',provider_id=p_provider_id,accepted_at=t,last_error_code=NULL WHERE id=o.id;
  ELSIF p_kind IN ('not_sent','rate_limited') AND p_retry_at>t
    AND greatest(p_retry_at,t+interval '30 seconds')<o.first_send_at+interval '23 hours' AND o.attempts<4 THEN
    UPDATE employer_delivery.outbox SET state='pending',next_attempt_at=greatest(p_retry_at,t+interval '30 seconds'),last_error_code=upper(p_kind) WHERE id=o.id;
  ELSIF p_kind IN ('uncertain','concurrent_conflict') THEN
    UPDATE employer_delivery.outbox SET state='uncertain',last_error_code=upper(p_kind) WHERE id=o.id;
  ELSIF p_kind IN ('not_sent','rate_limited','rejected','payload_conflict') THEN
    UPDATE employer_delivery.outbox SET state='blocked',last_error_code=upper(p_kind) WHERE id=o.id;
  ELSE
    UPDATE employer_delivery.outbox SET state='uncertain',last_error_code='INVALID_OUTCOME' WHERE id=o.id;
  END IF;
  UPDATE employer_delivery.outbox SET lease=NULL,lease_expires_at=NULL WHERE id=o.id;
  RETURN true;
END $$;
CREATE FUNCTION public.employer_outbox_watchdog() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; n integer:=0;
BEGIN
  FOR o IN SELECT * FROM employer_delivery.outbox WHERE state='sending' AND lease_expires_at<=clock_timestamp()
    ORDER BY lease_expires_at,id FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
    UPDATE employer_delivery.outbox SET state='uncertain',last_error_code='LEASE_EXPIRED_SENDING',lease=NULL,lease_expires_at=NULL WHERE id=o.id;
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
-- Only a verified provider receipt or explicit provider evidence of non-acceptance may call this API.
-- A timeout, absence from a search, 5xx, or expired idempotency record is NOT evidence.
CREATE FUNCTION public.employer_outbox_reconcile(p_id uuid,p_digest text,p_kind text,p_provider_id text,p_evidence_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o employer_delivery.outbox; prior employer_delivery.reconciliation;
BEGIN
  IF p_kind NOT IN ('accepted','not_sent') OR p_evidence_id IS NULL OR length(p_evidence_id) NOT BETWEEN 1 AND 255
    OR (p_kind='accepted' AND (p_provider_id IS NULL OR length(p_provider_id) NOT BETWEEN 1 AND 255)) THEN RETURN false; END IF;
  SELECT * INTO o FROM employer_delivery.outbox WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR o.payload_sha256 IS DISTINCT FROM p_digest THEN RETURN false; END IF;
  SELECT * INTO prior FROM employer_delivery.reconciliation WHERE evidence_id=p_evidence_id;
  IF FOUND THEN RETURN prior.outbox_id=p_id AND prior.payload_sha256=p_digest AND prior.outcome=p_kind AND prior.provider_id IS NOT DISTINCT FROM p_provider_id; END IF;
  IF o.state<>'uncertain' THEN RETURN false; END IF;
  INSERT INTO employer_delivery.reconciliation(evidence_id,outbox_id,payload_sha256,outcome,provider_id) VALUES(p_evidence_id,p_id,p_digest,p_kind,p_provider_id);
  UPDATE employer_delivery.outbox SET state=CASE WHEN p_kind='accepted' THEN 'accepted'
      WHEN redacted_at IS NOT NULL THEN 'cancelled'
      WHEN attempts<4 AND first_send_at+interval '23 hours'>clock_timestamp()+interval '30 seconds' AND employer_delivery.authorized(o) THEN 'pending'
      ELSE 'blocked' END,
    provider_id=CASE WHEN p_kind='accepted' THEN p_provider_id ELSE provider_id END,
    accepted_at=CASE WHEN p_kind='accepted' THEN clock_timestamp() ELSE accepted_at END,
    next_attempt_at=clock_timestamp()+interval '30 seconds',last_error_code='RECONCILED_'||upper(p_kind) WHERE id=o.id;
  RETURN true;
END $$;

-- Called only after the server authenticates a provider webhook signature and event type.
CREATE FUNCTION public.employer_outbox_record_receipt(p_application_id uuid,p_digest text,p_provider_id text,p_evidence_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o employer_delivery.outbox; prior employer_delivery.reconciliation;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_provider_id IS NULL OR length(p_provider_id) NOT BETWEEN 1 AND 255
   OR p_evidence_id IS NULL OR length(p_evidence_id) NOT BETWEEN 1 AND 255 THEN RETURN false; END IF;
 SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=p_application_id FOR UPDATE;
 IF NOT FOUND OR o.attempts=0 OR o.state NOT IN ('sending','uncertain','accepted') OR o.payload_sha256 IS DISTINCT FROM p_digest
   OR (o.provider_id IS NOT NULL AND o.provider_id<>p_provider_id) THEN RETURN false; END IF;
 SELECT * INTO prior FROM employer_delivery.reconciliation WHERE evidence_id=p_evidence_id;
 IF FOUND THEN RETURN prior.outbox_id=o.id AND prior.payload_sha256=p_digest AND prior.outcome='accepted' AND prior.provider_id=p_provider_id; END IF;
 INSERT INTO employer_delivery.reconciliation(evidence_id,outbox_id,payload_sha256,outcome,provider_id)
   VALUES(p_evidence_id,o.id,p_digest,'accepted',p_provider_id);
 UPDATE employer_delivery.outbox SET state='accepted',provider_id=p_provider_id,accepted_at=coalesce(accepted_at,clock_timestamp()),
   lease=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE id=o.id;
 RETURN true;
END $$;

-- Exact approved model/rate/token configuration is required; there are NO seeded models/rates.
-- New versions are new IDs. Runtime cannot invent prices, raise caps, or enable a provider.
CREATE TABLE employer_delivery.budget_configuration (
  id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, context_bound_verified boolean NOT NULL DEFAULT false,
  provider text NOT NULL, model text NOT NULL,
  input_microusd_per_million bigint NOT NULL CHECK (input_microusd_per_million>0),
  output_microusd_per_million bigint NOT NULL CHECK (output_microusd_per_million>0),
  max_input_tokens integer NOT NULL CHECK (max_input_tokens>0), max_output_tokens integer NOT NULL CHECK (max_output_tokens>0),
  per_application_microusd bigint NOT NULL CHECK (per_application_microusd>0),
  daily_microusd bigint NOT NULL CHECK (daily_microusd>0)
);
CREATE TABLE employer_delivery.budget_days (
  config_id text NOT NULL REFERENCES employer_delivery.budget_configuration(id), day date NOT NULL,
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd>=0), PRIMARY KEY(config_id,day)
);
-- One fixed JobLink API scope, NOT employer/account/configuration-specific. No RPC
-- accepts a scope or cap. New configuration IDs/rates cannot reset this allowance.
-- The month is the database UTC dispatch-authorization month, not provider billing.
CREATE TABLE employer_delivery.budget_months (
  scope text NOT NULL DEFAULT 'joblink-screening-api' CHECK (scope='joblink-screening-api'),
  month date NOT NULL CHECK (extract(day FROM month)=1),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd BETWEEN 0 AND 5000000),
  PRIMARY KEY(scope,month)
);
CREATE TABLE employer_delivery.budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES employer_delivery.outbox(id),
  account_id uuid NOT NULL, application_id uuid NOT NULL, config_id text NOT NULL REFERENCES employer_delivery.budget_configuration(id),
  day date NOT NULL, budget_scope text NOT NULL DEFAULT 'joblink-screening-api' CHECK (budget_scope='joblink-screening-api'),
  month date NOT NULL CHECK (extract(day FROM month)=1),
  lease uuid NOT NULL, snapshot_sha256 text NOT NULL, request_key text NOT NULL,
  model text NOT NULL, input_microusd_per_million bigint NOT NULL, output_microusd_per_million bigint NOT NULL,
  input_token_ceiling integer NOT NULL, max_output_tokens integer NOT NULL,
  reserved_microusd bigint NOT NULL CHECK (reserved_microusd BETWEEN 1 AND 5000000),
  charged_microusd bigint NOT NULL CHECK (charged_microusd BETWEEN 0 AND reserved_microusd),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatched','settled','uncertain','released')),
  input_tokens integer, output_tokens integer, evidence_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatched_at timestamptz, settled_at timestamptz,
  UNIQUE(application_id,request_key), UNIQUE(application_id)
);
CREATE UNIQUE INDEX budget_usage_receipt_unique ON employer_delivery.budget_reservations(evidence_id) WHERE evidence_id IS NOT NULL;
CREATE FUNCTION employer_delivery.protect_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN RAISE EXCEPTION 'CONFIGURATION_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_configuration BEFORE UPDATE ON employer_delivery.budget_configuration FOR EACH ROW EXECUTE FUNCTION employer_delivery.protect_configuration();
CREATE FUNCTION public.employer_screening_reserve_budget(p_application_id uuid,p_lease uuid,p_snapshot_sha256 text,p_config_id text,
 p_input_token_ceiling integer,p_max_output_tokens integer,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o employer_delivery.outbox; c employer_delivery.budget_configuration; r employer_delivery.budget_reservations;
  d date; m date; reserved_at timestamptz; cost bigint; used bigint; monthly_used bigint;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=p_application_id FOR UPDATE;
  IF NOT FOUND OR o.state<>'claimed' OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease OR o.lease_expires_at<=clock_timestamp()
    OR o.processing_deadline-interval '25 seconds'<=clock_timestamp() OR o.snapshot_sha256 IS DISTINCT FROM p_snapshot_sha256 OR o.snapshot_json IS NULL
    OR o.rubric_json IS NULL OR NOT coalesce(employer_delivery.authorized(o),false) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM employer_delivery.budget_configuration WHERE id=p_config_id AND enabled AND context_bound_verified AND provider='openai' AND model='gpt-6-luna' FOR SHARE;
  IF NOT FOUND OR (p_input_token_ceiling IS NOT NULL AND p_input_token_ceiling<>c.max_input_tokens)
    OR p_max_output_tokens IS NULL OR p_max_output_tokens NOT BETWEEN 1 AND c.max_output_tokens
    OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
  p_input_token_ceiling:=c.max_input_tokens;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE application_id=p_application_id FOR UPDATE;
  IF FOUND THEN
    IF r.request_key<>p_request_key OR r.lease<>p_lease OR r.snapshot_sha256<>p_snapshot_sha256 OR r.config_id<>p_config_id
      OR r.input_token_ceiling<>p_input_token_ceiling OR r.max_output_tokens<>p_max_output_tokens OR r.state<>'reserved'
      OR r.day IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'UTC')::date THEN RETURN NULL; END IF;
  ELSE
    cost:=ceil((p_input_token_ceiling::numeric*c.input_microusd_per_million+p_max_output_tokens::numeric*c.output_microusd_per_million)/1000000)::bigint;
    IF cost>c.per_application_microusd OR cost>5000000 THEN RETURN NULL; END IF;
    d:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
    m:=date_trunc('month',d::timestamp)::date;
    -- Lock order: outbox -> reservation -> fixed month -> configuration/day.
    -- Configuration is read-locked above; all money mutations lock month before day.
    INSERT INTO employer_delivery.budget_months(month) VALUES(m) ON CONFLICT DO NOTHING;
    SELECT reserved_microusd INTO monthly_used FROM employer_delivery.budget_months
      WHERE scope='joblink-screening-api' AND month=m FOR UPDATE;
    INSERT INTO employer_delivery.budget_days(config_id,day) VALUES(c.id,d) ON CONFLICT DO NOTHING;
    SELECT reserved_microusd INTO used FROM employer_delivery.budget_days WHERE config_id=c.id AND day=d FOR UPDATE;
    -- Sampling before lock waits would allow old-day/month debit after rollover.
    reserved_at:=clock_timestamp();
    IF d IS DISTINCT FROM (reserved_at AT TIME ZONE 'UTC')::date
      OR o.lease_expires_at<=reserved_at OR o.processing_deadline-interval '25 seconds'<=reserved_at
      OR cost>c.daily_microusd-used OR cost>5000000-monthly_used THEN RETURN NULL; END IF;
    UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd+cost
      WHERE scope='joblink-screening-api' AND month=m;
    UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd+cost WHERE config_id=c.id AND day=d;
    INSERT INTO employer_delivery.budget_reservations(outbox_id,account_id,application_id,config_id,day,month,lease,snapshot_sha256,request_key,
      model,input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd)
    VALUES(o.id,o.account_id,o.application_id,c.id,d,m,p_lease,p_snapshot_sha256,p_request_key,c.model,c.input_microusd_per_million,
      c.output_microusd_per_million,p_input_token_ceiling,p_max_output_tokens,cost,cost) RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('reservation_id',r.id,'reserved_microusd',r.reserved_microusd,'model',r.model,
    'input_microusd_per_million',r.input_microusd_per_million,'output_microusd_per_million',r.output_microusd_per_million,
    'input_token_ceiling',r.input_token_ceiling,'max_output_tokens',r.max_output_tokens);
END $$;
CREATE FUNCTION public.employer_screening_start_request(p_reservation_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations; o employer_delivery.outbox; dispatch_at timestamptz;
BEGIN
  -- Follow outbox -> reservation ordering everywhere that needs both rows.
  SELECT o1.* INTO o FROM employer_delivery.outbox o1 JOIN employer_delivery.budget_reservations r1 ON r1.outbox_id=o1.id
    WHERE r1.id=p_reservation_id FOR UPDATE OF o1;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR r.state<>'reserved' THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_configuration WHERE id=r.config_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_months WHERE scope=r.budget_scope AND month=r.month
    AND reserved_microusd>=r.charged_microusd FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_days WHERE config_id=r.config_id AND day=r.day
    AND reserved_microusd>=r.charged_microusd FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- UTC authorization time is sampled AFTER every potentially blocking lock.
  -- Do not transfer old reservations into a fresh day/month or reuse an old cap.
  dispatch_at:=clock_timestamp();
  IF r.day IS DISTINCT FROM (dispatch_at AT TIME ZONE 'UTC')::date
    OR r.month IS DISTINCT FROM date_trunc('month',dispatch_at AT TIME ZONE 'UTC')::date
    OR p_lease IS NULL OR r.lease<>p_lease OR o.lease IS DISTINCT FROM p_lease OR o.state<>'claimed'
    OR o.lease_expires_at<=dispatch_at OR o.processing_deadline-interval '25 seconds'<=dispatch_at
    OR NOT coalesce(employer_delivery.authorized(o),false) THEN RETURN false; END IF;
  UPDATE employer_delivery.budget_reservations SET state='dispatched',dispatched_at=dispatch_at WHERE id=r.id;
  RETURN true;
END $$;
CREATE FUNCTION public.employer_screening_settle_budget(p_reservation_id uuid,p_input_tokens integer,p_output_tokens integer,p_evidence_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations; cost bigint;
BEGIN
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.state='settled' THEN RETURN r.input_tokens IS NOT DISTINCT FROM p_input_tokens AND r.output_tokens IS NOT DISTINCT FROM p_output_tokens AND r.evidence_id IS NOT DISTINCT FROM p_evidence_id; END IF;
  IF r.state NOT IN ('dispatched','uncertain') THEN RETURN false; END IF;
  IF p_input_tokens IS NULL OR p_output_tokens IS NULL OR p_input_tokens NOT BETWEEN 0 AND r.input_token_ceiling
    OR p_output_tokens NOT BETWEEN 0 AND r.max_output_tokens OR p_evidence_id IS NULL OR length(p_evidence_id) NOT BETWEEN 1 AND 255 THEN
    UPDATE employer_delivery.budget_reservations SET state='uncertain' WHERE id=r.id; RETURN false;
  END IF;
  cost:=ceil((p_input_tokens::numeric*r.input_microusd_per_million+p_output_tokens::numeric*r.output_microusd_per_million)/1000000)::bigint;
  IF cost>r.reserved_microusd OR cost>r.charged_microusd THEN
    UPDATE employer_delivery.budget_reservations SET state='uncertain' WHERE id=r.id; RETURN false;
  END IF;
  -- Refund only the original accounting month/day, never the settlement month.
  UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd-(r.charged_microusd-cost)
    WHERE scope=r.budget_scope AND month=r.month;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd-(r.charged_microusd-cost) WHERE config_id=r.config_id AND day=r.day;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_reservations SET state='settled',charged_microusd=cost,input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,evidence_id=p_evidence_id,settled_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;
-- This is proof of database non-dispatch, not a provider-refund RPC. A timeout,
-- failed HTTP request, missing receipt or caller's assertion cannot release usage.
CREATE FUNCTION public.employer_screening_release_budget(p_reservation_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations;
BEGIN
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR p_lease IS NULL OR r.lease IS DISTINCT FROM p_lease THEN RETURN false; END IF;
  IF r.state='released' THEN RETURN true; END IF;
  IF r.state<>'reserved' OR r.dispatched_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd-r.charged_microusd
    WHERE scope=r.budget_scope AND month=r.month;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd-r.charged_microusd WHERE config_id=r.config_id AND day=r.day;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_reservations SET state='released',charged_microusd=0,settled_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;

-- Pre-register the exact private object before upload so failed/abandoned submissions leave no untracked blobs.
CREATE FUNCTION public.employer_outbox_register_capture(p_application_id uuid,p_applicant_user_id uuid,p_storage_path text,p_sha256 text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c employer_delivery.capture_cleanup;
BEGIN
 IF p_application_id IS NULL OR p_applicant_user_id IS NULL OR p_storage_path IS NULL OR p_sha256 IS NULL
   OR p_sha256 !~ '^[a-f0-9]{64}$'
   OR p_storage_path !~ ('^'||p_applicant_user_id::text||'/'||p_application_id::text||'/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$')
   OR NOT EXISTS(SELECT 1 FROM public.seeker_profiles sp JOIN public.users u ON u.id=sp.user_id WHERE u.id=p_applicant_user_id AND u.role='seeker' AND NOT u.is_banned)
   THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM employer_delivery.outbox WHERE application_id=p_application_id) THEN RETURN false; END IF;
 INSERT INTO employer_delivery.capture_cleanup(application_id,storage_path,capture_key,sha256,next_attempt_at)
   VALUES(p_application_id,p_storage_path,encode(sha256(convert_to(p_storage_path,'UTF8')),'hex'),p_sha256,clock_timestamp()+interval '1 hour') ON CONFLICT(capture_key) DO NOTHING;
 SELECT * INTO c FROM employer_delivery.capture_cleanup WHERE capture_key=encode(sha256(convert_to(p_storage_path,'UTF8')),'hex');
 RETURN c.application_id=p_application_id AND c.sha256=p_sha256 AND c.state='pending';
END $$;
CREATE FUNCTION public.employer_outbox_claim_cleanup() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c employer_delivery.capture_cleanup;
BEGIN
 SELECT * INTO c FROM employer_delivery.capture_cleanup WHERE next_attempt_at<=clock_timestamp()
   AND (state='pending' OR (state='claimed' AND lease_expires_at<=clock_timestamp()))
   AND NOT EXISTS(SELECT 1 FROM employer_delivery.outbox o WHERE o.redacted_at IS NULL AND o.attachment->>'storagePath'=capture_cleanup.storage_path)
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE employer_delivery.capture_cleanup SET state='claimed',lease=gen_random_uuid(),
   lease_expires_at=clock_timestamp()+interval '3 minutes',attempts=attempts+1 WHERE id=c.id RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'application_id',c.application_id,'storage_path',c.storage_path,'sha256',c.sha256,'lease',c.lease);
END $$;
CREATE FUNCTION public.employer_outbox_finish_cleanup(p_id uuid,p_lease uuid,p_deleted boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE employer_delivery.capture_cleanup SET state=CASE WHEN p_deleted THEN 'deleted' ELSE 'pending' END,
   storage_path=CASE WHEN p_deleted THEN NULL ELSE storage_path END,sha256=CASE WHEN p_deleted THEN NULL ELSE sha256 END,
   deleted_at=CASE WHEN p_deleted THEN clock_timestamp() ELSE NULL END,
   next_attempt_at=clock_timestamp()+interval '15 minutes',lease=NULL,lease_expires_at=NULL
 WHERE id=p_id AND state='claimed' AND lease=p_lease AND lease_expires_at>clock_timestamp() AND p_deleted IS NOT NULL;
 RETURN FOUND;
END $$;

-- Defense in depth: private tables are unavailable even to service_role; only explicit RPCs are exposed.
DO $$ DECLARE t record; f record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='employer_delivery' LOOP
  EXECUTE format('ALTER TABLE employer_delivery.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('REVOKE ALL ON employer_delivery.%I FROM PUBLIC,anon,authenticated,service_role',t.tablename);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='employer_delivery' OR (n.nspname='public' AND (p.proname LIKE 'employer_outbox_%' OR p.proname LIKE 'employer_screening_%')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
  IF f.nspname='public' THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END IF;
 END LOOP;
END $$;
COMMIT;
