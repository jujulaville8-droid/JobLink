# Employer approvals for Google JobPosting

Imported/admin-posted jobs require employer authorization before the job detail
page emits `JobPosting`. A single-vacancy yes must be recorded in
`EMPLOYER_APPROVED_JOBS`, keyed by job ID and bound to that job's company ID.
Other jobs at the company remain excluded unless independently authorized or the
owner explicitly attests company-wide permission covering current and future
jobs. Record that scope in `EMPLOYER_APPROVED_COMPANIES`, keyed by company ID.
Existing legitimate self-posted listings and Top Bun's existing company-wide
approval/type correction retain their behavior. Approval never changes a job's
status, expiry, posted date, pay, or description.

## September 30, 2026 owner attestation

The original scoped approvals enabled these exact vacancies. The site owner
directly confirmed that both employers approved publication on September 30,
2026 at 20:02 UTC in
message `Sentinel_cace3b51c42c81919512b87c905bc49a`. Each entry records that date
as `attestedOn` and identifies the owner attestation in `evidenceReference`.
This does not assert that historical employer email replies were independently
inspected. No email copies are required and no shared Zoho session was accessed.

| Job | Job ID | Company ID | Attested on |
| --- | --- | --- | --- |
| MOfit Gym and Fitness Centre — Gym Attendant | `318d3b16-6aff-453c-b0d3-fc5f2d779783` | `1b11e815-e80b-4b35-affe-55c1d1fc16db` | 2026-09-30 |
| Woodstock BoatBuilders — Carpenter / Boatbuilder | `bb1b011d-4e5c-4005-81b6-bc70c48acf4f` | `6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961` | 2026-09-30 |

## Listing facts checked

Read-only public HTML on September 30 contained only `BreadcrumbList` for both
jobs. Company IDs came from the company-profile links and were confirmed by an
anonymous public record read. The public record snapshots are preserved in
`tests/fixtures/approved-job-listings.json` for deterministic server-HTML tests.

- MOfit: `created_at` is `2026-09-29T22:08:08.998576+00:00`; location is Vista,
  Antigua; full time; no stated expiry or numeric salary. Its complete stored
  description matches the short public description, including the email route
  to apply. No extra duties, experience or qualifications were invented.
- Woodstock: `created_at` is `2026-09-30T15:30:24.953557+00:00`; location is
  English Harbour, Antigua; full time; no numeric salary. The full stored
  description matches the public responsibilities, experience expectations,
  application email and **Apply before: 29 October 2026** deadline.

`datePosted` retains each original stored listing timestamp; the attestation
does not reset it or claim an earlier social-post date. Both records have null
`expires_at`. Woodstock's scoped approval supplies `validThrough: "2026-10-29"`
as a date only, without inventing a cutoff time. On October 29 in
`America/Antigua`, its `JobPosting` markup stops because the visible instruction
says apply *before* that date. The ordinary page and board keep their existing
manual-close behavior. A subsequently stored `expires_at` takes precedence.
MOfit has no supplied deadline, so none is invented. No database writes,
migrations, permissions or live settings are part of this change.

## Google requirements checked

[Google's current JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
requires employer authorization, one job per detail page, accessible matching
content, an application route, and required title, original date, complete HTML
description, hiring organization and physical location including country (with
separate rules for remote jobs). A known deadline requires `validThrough`;
expired/closed jobs must be removed or their markup retired. Salary must come
from the employer. Structured data permits eligibility, not guaranteed inclusion.

The patch adds scoped authorization and the missing date-only deadline fallback.
Schema descriptions retain the full visible text with HTML paragraph formatting;
titles, dates, locations and salary handling are otherwise unchanged. Google's
Rich Results Test and post-deployment URL inspection remain release validation;
no Google inclusion or live deployment is claimed by local tests.

## PR #17 compatibility

Reviewed `codex/company-claim-flow` at
`888444f57e0b9fc73e4e44b17952d7c0be38edbe` against main
`0e09b94ee6ba662ce41b47c5a4b48d8ab49f3a4b`. Its claim migration changes
`companies.user_id` and preserves company ID, job ID and `posted_by_admin`.
Approvals use those stable IDs, not the owner or company name. Claiming a company
therefore retains an existing approval and does not itself expand its scope.
Other admin-posted jobs are authorized only when an explicit company-wide
approval exists. The regression suite exercises approval retention and removal,
including after an owner change.

Run `npm test` and the CI-equivalent production build. Focused server-rendered
schema tests are in `tests/jobposting-approvals.spec.tsx`. They use the public
record snapshots and explicit approvals, with synthetic modifications only
for negative, ownership-transfer and expiry-boundary scenarios.

## October 5, 2026 company-wide owner attestation

The owner explicitly requested company-level Google Jobs approvals for Nobu
Barbuda, MOfit, and Woodstock in the October 5 task, delegated from thread
`01a0f0a4-b7e2-7538-9351-8cf94b845037`. This is the provenance for the
company-wide entries; no direct employer email or independent employer evidence
is claimed. The owner supplied the approval dates below, including September 30
for MOfit and Woodstock.

| Company | Company ID | Approved on | Scope |
| --- | --- | --- | --- |
| Nobu Barbuda | `9fde7fc7-70b3-4354-9d11-d520f4ec09f9` | 2026-10-05 | Current and future jobs |
| MOfit Gym and Fitness Centre | `1b11e815-e80b-4b35-affe-55c1d1fc16db` | 2026-09-30 | Current and future jobs |
| Woodstock BoatBuilders | `6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961` | 2026-09-30 | Current and future jobs |

Nobu's existing company-wide entry is retained. MOfit and Woodstock now also
appear in `EMPLOYER_APPROVED_COMPANIES`. Their original vacancy entries remain
in `EMPLOYER_APPROVED_JOBS` so job-specific metadata takes precedence, including
Woodstock's October 29 deadline. That deadline applies only to the original
vacancy; no deadline is inferred for another or future job. Unapproved companies
remain excluded from imported/admin-posted JobPosting markup. No job content,
expiration policy, database records, or live settings were changed.
