-- ============================================================================
-- Migration 20261114010000: public_views_companies_listings (PHASE A ONLY)
-- Addresses: Bionic security report 2026-11-12, findings #4 and #5
--   #4 companies fully readable by anon, incl. internal columns (LOW)
--   #5 job_listings exposes internal columns to anon (LOW)
-- Prepared as joblink-security-prep/02-public-views.sql; applied to
-- production 2026-11-13 (package log: APPLY-LOG-2026-11-13.md). The column
-- inventory below includes the three live-only columns verified at apply
-- time per REVIEW-2026-11-13.md. Phase B remains a separate, unapproved
-- step and appears in this file as comments only.
-- ============================================================================
-- This file is PHASE A ONLY: it creates the public views and grants reads
-- on them. It changes nothing about the base tables, their policies or
-- their grants, so applying it alone cannot break the site — and also does
-- not, by itself, close the findings. The findings close in PHASE B
-- (described at the bottom), which is the RISKY step: it needs the frontend
-- and API moved onto the views first, and it must be reviewed against the
-- other agent's merged work before anyone touches base-table access.
--
-- Column inventory (verified 2026-11-13 against the repo migrations in the
-- joblink-notif clone; the applier should re-verify with PC1 below because
-- the live DB has already drifted from the repo once — see 01):
--
--   companies (00002_fresh_schema + later migrations):
--     id, user_id, company_name, logo_url, description, industry, website,
--     location, contact_email (20261005152749), is_verified,
--     is_pro, pro_expires_at,
--     stripe_customer_id (20260925_security_hardening_2),
--     claimed_at (20261015204106_company_claims),
--     is_confidential (20261110010000_confidential_employers), created_at
--     PLUS, verified live at apply time (2026-11-13, PC1 via
--     REVIEW-2026-11-13.md; not in the repo migration inventory):
--     contact_phone — INTERNAL (contact channel, same judgement as
--     contact_email). Excluded from the view.
--
--   job_listings (00002_fresh_schema + later migrations):
--     id, company_id, title, description, category, job_type, salary_min,
--     salary_max, salary_type (20261025120000), salary_visible, location,
--     requires_work_permit, status, is_featured, expires_at, created_at,
--     updated_at (20261014125500),
--     benefits, draft_data (20261026190000_employer_drafts_and_benefits),
--     posted_by_admin (20260323_admin_posted_flag),
--     structured_data_consent, structured_data_consent_at
--       (20261106170000_job_listings_structured_data_consent),
--     is_confidential (20261110010000_confidential_employers)
--     PLUS, verified live at apply time (2026-11-13, PC1 via
--     REVIEW-2026-11-13.md; not in the repo migration inventory):
--     is_imported, source_url — INTERNAL (import provenance). Excluded
--     from the view.
--
-- Excluded from the views:
--   companies:    user_id, is_pro, pro_expires_at        (named in report)
--                 stripe_customer_id                     (payment identifier —
--                                                         never public)
--                 claimed_at                             (internal claim state)
--                 contact_email                          (JUDGEMENT CALL: the
--                   platform routes contact through the site; no public page
--                   is known to display it. If the merged frontend does show
--                   a public contact email, add it back here deliberately.)
--                 contact_phone                          (live-only column,
--                   added to the inventory 2026-11-13; contact channel,
--                   same judgement as contact_email)
--   job_listings: draft_data, posted_by_admin,
--                 structured_data_consent, structured_data_consent_at
--                                                         (named in report)
--                 is_imported, source_url                (live-only columns,
--                   added to the inventory 2026-11-13; import provenance)
-- Kept deliberately:
--   job_listings.is_confidential — the 20261110 confidentiality design
--     REQUIRES it ("Listings carry their own is_confidential flag
--     so public pages can label them without reading the hidden company
--     row"). Removing it would break the "Confidential employer" label.
--   companies_public filters WHERE NOT is_confidential — the view runs
--     with owner rights (see below), so without this filter it would
--     re-expose exactly the companies the 20261110 policy change hid.
-- ============================================================================


-- ============================================================================
-- PRE-CHECKS
-- ============================================================================

-- PC1. Confirm the live column lists match the inventory above. Any column
--      present live but not listed here must be classified (display or
--      internal) before this file is applied.
-- select table_name, column_name
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('companies', 'job_listings')
--  order by table_name, ordinal_position;

-- PC2. Confirm no views with these names already exist in the merged repo
--      or live DB (the other agent may have created equivalents):
-- select table_name from information_schema.views
--  where table_schema = 'public'
--    and table_name in ('companies_public', 'job_listings_public');


-- ============================================================================
-- PHASE A — additive only. Idempotent, safe to re-run.
-- ============================================================================

BEGIN;

-- Public company data: display fields only, confidential companies excluded.
-- security_invoker = false is deliberate and follows the project precedent
-- (public.company_owners, 20261110010000): the view executes with its
-- owner's rights so it can be read by anon/authenticated even after Phase B
-- tightens the base table. The column list and the is_confidential filter
-- are the entire security boundary of this view — review them, not the RLS.
CREATE OR REPLACE VIEW public.companies_public
  WITH (security_invoker = false)
AS
SELECT
  id,
  company_name,
  logo_url,
  description,
  industry,
  website,
  location,
  is_verified,
  created_at
FROM public.companies
WHERE NOT is_confidential;

COMMENT ON VIEW public.companies_public IS
  'Public display fields for companies. Excludes user_id, is_pro, pro_expires_at, stripe_customer_id, claimed_at, contact_email. Confidential companies are filtered out (20261110 design).';

REVOKE ALL ON public.companies_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.companies_public TO anon, authenticated;

-- Public listing data: display fields only. Row visibility still comes
-- from the base table for now; the view adds no filter of its own beyond
-- what the caller could already query, EXCEPT that it must not leak
-- non-active listings to anon through owner rights — so the status filter
-- mirrors the existing "Active jobs are publicly viewable" policy.
CREATE OR REPLACE VIEW public.job_listings_public
  WITH (security_invoker = false)
AS
SELECT
  id,
  company_id,
  title,
  description,
  category,
  job_type,
  salary_min,
  salary_max,
  salary_type,
  salary_visible,
  location,
  requires_work_permit,
  status,
  is_featured,
  is_confidential,
  benefits,
  expires_at,
  created_at,
  updated_at
FROM public.job_listings
WHERE status = 'active';

COMMENT ON VIEW public.job_listings_public IS
  'Public display fields for active job listings. Excludes draft_data, posted_by_admin, structured_data_consent, structured_data_consent_at.';

REVOKE ALL ON public.job_listings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_listings_public TO anon, authenticated;

COMMIT;


-- ============================================================================
-- POST-CHECKS (Phase A)
-- ============================================================================
-- V1. select count(*) from public.companies_public;  -- ~= non-confidential
--     company count (54 total companies per the report, minus confidential)
-- V2. select * from public.job_listings_public limit 3;  -- eyeball columns:
--     no draft_data / posted_by_admin / structured_data_consent present.
-- V3. As anon (site, signed out): the views answer; the site itself is
--     unchanged because nothing reads the views yet.


-- ============================================================================
-- PHASE B — DO NOT RUN FROM THIS FILE. RISKY. SEPARATE APPROVAL REQUIRED.
-- ============================================================================
-- The findings only close when anonymous reads of the BASE tables stop
-- exposing the internal columns. Postgres RLS filters rows, not columns,
-- so Phase B is a grant change, and it will break every code path that
-- reads companies/job_listings directly with the anon (or authenticated)
-- key unless those reads have moved to the views first.
--
-- Frontend / API changes required BEFORE Phase B can be applied:
--   1. Inventory every direct read of the base tables with the public
--      clients. Starting points (verify against the MERGED repo; the other
--      agent's work may add or remove call sites):
--        - public job board + job detail pages: from('job_listings'),
--          usually joined with companies — switch to job_listings_public
--          and companies_public.
--        - homepage / search / SEO surfaces (sitemap, JSON-LD structured
--          data, OG tags): same switch; these are server-side anon reads.
--        - the mobile app (Expo) reads job_listings/companies with the
--          anon/authenticated key — app stores lag; a base-table revoke
--          breaks already-installed app versions until they update.
--        - anything reading companies.user_id to route applications or
--          messages must use public.company_owners (already exists,
--          authenticated only) instead — that was built for this purpose.
--        - admin tooling and the push panel read as authenticated/admin;
--          confirm each uses a path that still works (service_role bypasses
--          grants entirely and is unaffected).
--   2. Decide the authenticated story: employers managing their own
--      company/listings legitimately read base-table rows (their own).
--      The narrow Phase B is therefore: revoke SELECT on the base tables
--      from ANON only, and leave authenticated + existing RLS as is. Anon
--      is where the report's exposure is. Do not revoke authenticated
--      without a full call-site audit.
--   3. Only then, in its own migration, after the frontend deploy that
--      uses the views is live and verified:
--        REVOKE SELECT ON public.companies FROM anon;
--        REVOKE SELECT ON public.job_listings FROM anon;
--      and re-check the public site end to end (jobs page, job detail,
--      apply flow entry, sitemap) signed out.
--
-- ⚠️ COORDINATION FLAG: Phase B depends on the exact set of read call
-- sites in the merged codebase. Review this section against the other
-- agent's merged changes (per APPLY-RUNBOOK.md) and re-run the inventory
-- grep on the merged tree before scheduling Phase B. Until then the base
-- tables stay as they are.
