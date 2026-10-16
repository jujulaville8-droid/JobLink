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

## October 2026 scoped SEO release

[PR #25](https://github.com/jujulaville8-droid/JobLink/pull/25) records employer
permission on October 6 for the **Driver Guide** listing,
job `232f9e93-d28c-4e8b-bdb5-3c85093e61d6`, at company
`e9703c50-bfef-41fb-99f1-5ba9387418c2`. That permission is vacancy-specific and
belongs only in `EMPLOYER_APPROVED_JOBS`, bound to both IDs. No new employer
email verification or company-wide permission is claimed. The same record
identifies `full_time` as an unconfirmed placeholder: optional `employmentType`
markup is omitted until confirmation. Stored listing content stays unchanged.

Top Bun's [Cook listing](https://joblinkantigua.com/jobs/e03a2b8c-f69b-42bb-bc43-13a5d0917291)
visibly states **Application deadline: October 3, 2026.** Its separate public
metadata record binds that date to the exact job and company. The date stays
date-only in `validThrough`; after October 3 has passed in Antigua, only
`JobPosting` is suppressed. No new employer permission or deadline is invented.
The page, breadcrumbs, description and Apply remain available until manual
status change. Other Top Bun jobs do not inherit this vacancy's deadline.
Shhatterr Shack was excluded from imported-job markup until its vacancy-scoped
approval below (October 12 ledger entry).

Legacy `expires_at` values no longer hide active pages, browse/category/company
results, sitemap entries, invitations or applications. Manual inactive statuses
still block those routes. Stored deadlines may suppress Google Jobs markup;
they do not alter listing status or the application route. This release makes
no database writes or migrations and does not change security or Pro expiry.

### Public deadline presentation (October 10, 2026)

Application-closing sentences with recognizable calendar dates are omitted
from the public description, saved-job excerpt, search/share description and
JobPosting description by the same presentation helper. Legacy job-expiry
badges/countdowns and the obsolete admin expiry-warning selector are removed.
Posting forms request descriptions without application cutoffs; they do not
add a date input or rewrite the original employer text.

Original descriptions and stored dates remain unchanged. The private editing
and approval views retain source text. Google Jobs eligibility and truthful
date-only `validThrough` facts remain separate from public presentation:
Top Bun stays ineligible after October 3, and Woodstock retains its exclusive
October 29 "Apply before" boundary. No renewal or additional consent is implied.

The October 10 production audit also verified these original October 30
deadlines, retained in `public-job-deadlines.ts` with exact vacancy/company
bindings. Neither record grants employer approval or enables JobPosting:

- Food Brokerage, `d4fdb396-a0b0-427d-aae0-ed756274375e`, company
  `42e58a5e-3f56-4f2b-b829-b9b335d45b81`: "Applications close October 30, 2026."
- Shhatterr, `ade78a5c-e0f6-4f5f-8008-117d7a4b96ee`, company
  `1b68107a-228a-4e97-b047-d4c14bd730ef`: "Application deadline: 30 October 2026."

The helper deliberately leaves ambiguous prose, work schedules, duty deadlines
and contact/application instructions intact. It is not a general natural-language
deadline detector. Mail APIs/templates, database records, application behavior,
and unrelated security, certification, Pro and billing expiry remain unchanged.

## October 12, 2026 vacancy-scoped employer approvals

[PR #38](https://github.com/jujulaville8-droid/JobLink/pull/38) records two
employer replies from the JobLink outreach CRM. Each permission covers one
vacancy only and lives in `EMPLOYER_APPROVED_JOBS`, bound to both IDs. No
company-wide permission is claimed, and other current or future jobs at either
company stay excluded. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Food Brokerage Services Ltd. — Van Sales Assistant/Operator | `d4fdb396-a0b0-427d-aae0-ed756274375e` | `42e58a5e-3f56-4f2b-b829-b9b335d45b81` | 2026-10-09 | Full Time, confirmed by the employer on 2026-10-09 |
| Shhatterr Shack Rage Room — Rage Room Attendant | `ade78a5c-e0f6-4f5f-8008-117d7a4b96ee` | `1b68107a-228a-4e97-b047-d4c14bd730ef` | 2026-10-08 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

Both jobs keep their existing October 30 date-only deadline from
`public-job-deadlines.ts` as `validThrough`; markup retires after that date in
Antigua. The deadline record itself still grants no approval. Stored listing
content, status and the application route are unchanged, and there are no
database writes.

## October 12, 2026 vacancy-scoped employer approvals (Street Blends, Hermitage Bay)

[PR #41](https://github.com/jujulaville8-droid/JobLink/pull/41) records two
employer replies from the JobLink outreach CRM received on October 12, 2026.
Each permission covers one vacancy only and lives in `EMPLOYER_APPROVED_JOBS`,
bound to both IDs. No company-wide permission is claimed, and other current or
future jobs at either company stay excluded. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Street Blends — Barista Prep Assistants | `03aeffa0-f680-46b2-b5eb-ea3891d0ce44` | `6b354ee5-ff32-44b3-a5c8-29f73650b51a` | 2026-10-12 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Hermitage Bay — Line Cook | `40b28447-7653-4646-bc21-b8f0653d9409` | `22a1fd24-ef01-4b55-8043-1cdca65bc25c` | 2026-10-12 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

Street Blends keeps the original October 15 date-only deadline from its public
Dadli Jobs posting, recorded in `public-job-deadlines.ts` and emitted as
`validThrough`; markup retires after that date in Antigua. Hermitage Bay has no
published deadline, so no `validThrough` is emitted. Stored listing content,
status and the application route are unchanged, and there are no database writes.

## October 13, 2026 vacancy-scoped employer approvals (Hermitage Bay kitchen roles)

[PR #45](https://github.com/jujulaville8-droid/JobLink/pull/45) records Hermitage Bay's October 13, 2026 reply from the JobLink
outreach CRM, which sent two further vacancies to post and confirmed both are
full-time. Each permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Hermitage Bay — Chef de Partie | `97fec756-f008-4409-8e77-155a334d6f43` | `22a1fd24-ef01-4b55-8043-1cdca65bc25c` | 2026-10-13 | Full Time, confirmed by the employer on 2026-10-13 |
| Hermitage Bay — Jr. Sous Chef | `ddcfe8d3-f258-4447-9161-08e224a1a81a` | `22a1fd24-ef01-4b55-8043-1cdca65bc25c` | 2026-10-13 | Full Time, confirmed by the employer on 2026-10-13 |

No deadline was published, so no `validThrough` is emitted. Stored listing
content, status and the application route are unchanged; no database writes.

## October 14, 2026 vacancy closures

`src/lib/job-closures.ts` records vacancies that are no longer available while
their stored status is still `active`. Each entry is bound to the job and
company IDs and closes once its date-only `closedAfter` has passed in Antigua.
A closed vacancy keeps its URL with a visible "no longer available" notice and
a link to similar jobs, is `noindex`, emits no `JobPosting`, rejects Apply, and
is removed from the sitemap, browse/category results, the homepage and company
pages.

- Top Bun — Cook (`e03a2b8c-f69b-42bb-bc43-13a5d0917291`): closed now (after October 3).
- Street Blends — Barista Prep Assistants: no longer auto-closes. The closure entry was removed in PR #59; jobs close only with Julian's approval.

Setting a listing's stored status to `closed` from the admin tools makes
the page a real 404; the entry can then be removed.

## October 14, 2026 vacancy-scoped employer approvals (Seagull Inflatables, Antigua's Donkey Sanctuary)

[PR #55](https://github.com/jujulaville8-droid/JobLink/pull/55) records two October 14, 2026 replies from the
JobLink outreach CRM in which each employer said yes to JobLink posting the
vacancy. Each permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Seagull Inflatables — Operations & Admin Coordinator | `7181a600-df8e-45dd-b8d1-a0e910c1f494` | `8b95a031-0ce5-4e2d-9087-fda18d2ccc7c` | 2026-10-14 | Full Time (seasonal), confirmed by the employer on 2026-10-14 |
| Antigua's Donkey Sanctuary — Team Member (Visitor Services & Gift Shop) | `66737b60-cf1a-4fd0-980c-14f1c9412923` | `ea87a75a-dece-4fd6-afa7-64efbd51a88d` | 2026-10-14 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

Seagull Inflatables keeps the October 18 date-only deadline from its public
Youth On The Move Facebook posting, recorded in `public-job-deadlines.ts` and
emitted as `validThrough`; markup retires after that date in Antigua. The
`job-closures.ts` entry from PR #54 was removed in PR #59, so the page stays
open until Julian approves closing it. The Donkey Sanctuary posting published
no deadline, so no `validThrough` is emitted. Stored listing content, status and
the application route are unchanged; no database writes.

## October 15, 2026 vacancy-scoped employer approvals (Trappas Restaurant and Bar)

[PR #65](https://github.com/jujulaville8-droid/JobLink/pull/65) records an October 15, 2026 reply from the
JobLink outreach CRM in which the employer said yes to JobLink posting these
two vacancies. Each permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Trappas Restaurant and Bar — Experienced Chef (Nights) | `c38baf47-a23c-4908-b2ed-c80163d6b06d` | `a528f079-6706-4e64-a351-eabcc47359f4` | 2026-10-15 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Trappas Restaurant and Bar — Kitchen Staff (Nights) | `ab781b7c-5c68-404f-bb7c-479a8b58264f` | `a528f079-6706-4e64-a351-eabcc47359f4` | 2026-10-15 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

Neither public posting published a deadline, so no `validThrough` is emitted
and no closure entry is added (no automatic job closing). Stored listing
content, status and the application route are unchanged; no database writes.

## October 16, 2026 vacancy-scoped employer approval (North Sound Brewery / Antigua Distillery)

[PR #67](https://github.com/jujulaville8-droid/JobLink/pull/67) records an October 16, 2026 reply from the
JobLink outreach CRM in which the employer's HR said yes to JobLink posting this
vacancy. The permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No email content is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| North Sound Brewery (Antigua Distillery) — Brewmaster | `7bd1f5b0-4da5-4177-b4c5-3cacc65b904b` | `07533d6c-77cc-4e6e-bdde-14d4fd3923a9` | 2026-10-16 | Full Time, as stated on the employer's public Dadli Jobs posting |

The public Dadli Jobs posting (https://dadlijobs.com/job/brewmaster/) listed an
October 16 date-only deadline, which PR #67 recorded in `public-job-deadlines.ts`.
On October 16, 2026 Julian removed that deadline, and
[PR #68](https://github.com/jujulaville8-droid/JobLink/pull/68) deleted the entry,
so no `validThrough` is emitted and the markup is treated like other no-deadline
jobs. No closure entry is added (no automatic job closing), so the page stays
open until Julian approves closing it. Stored listing content, status and the
application route are unchanged; no database writes.
