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

`JobPosting` descriptions replace email addresses with `[redacted]` before the
JSON-LD is emitted. The visible page, the jobs list pane, search/share metadata
and the stored listing keep the original address.

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
`validThrough`; markup retired after that date in Antigua until [PR #74](https://github.com/jujulaville8-droid/JobLink/pull/74)
removed the entry (see October 19 below). Hermitage Bay has no
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
emitted as `validThrough`; markup retired after that date in Antigua until
[PR #74](https://github.com/jujulaville8-droid/JobLink/pull/74) removed the entry (see October 19 below). The
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

## October 16, 2026 vacancy-scoped employer approval (Super Service Center)

[PR #70](https://github.com/jujulaville8-droid/JobLink/pull/70) records an October 16, 2026 (12:59 PM ET) email reply to
jobs@joblinkantigua.com in which the employer said yes to JobLink posting this
vacancy. The permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No email content beyond the approval is copied here.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Super Service Center — Tire Technician (Pares Village) | `e080f894-4e7f-48b7-b39a-1a274f52fd97` | `4b3ecdcd-01cc-4b67-8756-dc0247a04473` | 2026-10-16 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

The posting published no deadline, so no `validThrough` is emitted and no
closure entry is added (no automatic job closing). Stored listing content,
status and the application route are unchanged; no database writes.

## October 16, 2026 vacancy-scoped owner attestation (The Tailor's Daughter Inc.)

[PR #71](https://github.com/jujulaville8-droid/JobLink/pull/71) records an October 16, 2026 (10:57 PM ET) attestation from site
owner Julian Laville that he obtained the business's permission directly for
JobLink to post this vacancy, which was posted at his request. The permission
covers one vacancy only and lives in `EMPLOYER_APPROVED_JOBS`, bound to both
IDs. No company-wide permission is claimed. No contact details are recorded.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| The Tailor's Daughter Inc. — Part-Time Retail Sales Associate (V.C. Bird International Airport) | `cead1cc1-636b-438b-9c8a-bd39fd02c045` | `bda01a15-de79-41fc-b10e-5c4126115860` | 2026-10-16 | Part Time, as stated in the employer's post |

The posting published no deadline, so no `validThrough` is emitted and no
closure entry is added (no automatic job closing). Stored listing content,
status and the application route are unchanged; no database writes.

## October 19, 2026 public deadlines removed (Street Blends, Seagull Inflatables)

Julian turned off automatic job closing, so these two employer-approved
vacancies stay open with no deadline. Their `public-job-deadlines.ts` entries
(October 15 and October 18) had silently retired the JobPosting markup after
those dates while the pages stayed live. [PR #74](https://github.com/jujulaville8-droid/JobLink/pull/74) removes both entries,
so no `validThrough` is emitted and the markup is treated like other
no-deadline jobs. The vacancy-scoped approvals from PR #41 and PR #55 are
unchanged, and no closure entry is added.

The stored descriptions still contain the original "Application deadline"
lines, but `publicJobDescription` hides that labelled line on the page, in the
meta description and in the JSON-LD description, so nothing visible states a
past deadline. Stored listing content, status and the application route are
unchanged; no database writes.

## October 17–19, 2026 vacancy-scoped employer approvals (The Massage Goddess, ELand Courier Services)

[PR #76](https://github.com/jujulaville8-droid/JobLink/pull/76) records two email replies to the JobLink inbox in which each
employer said yes to JobLink posting the vacancy: The Massage Goddess on
October 19, 2026 (about 10:34 AM ET) and ELand Courier Services on October 17,
2026 (1:21 PM ET). Each permission covers one vacancy only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No contact details or email content beyond the approval are recorded.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| The Massage Goddess — Nail Technician (Coolidge) | `d00f5ff5-29cf-4110-9828-a2f84e49245f` | `5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3` | 2026-10-19 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| ELand Courier Services — Driver/Office Assistant (St. John's) | `e81d3a56-c9fe-42dd-99ab-a35398398582` | `d3c66ca7-9066-4f4a-a87c-a307b9d63ab5` | 2026-10-17 | Full Time, confirmed |

Neither live listing shows a deadline, so no `validThrough` is emitted and no
closure entry is added (no automatic job closing). Stored listing content,
status and the application route are unchanged; no database writes.

## November 3, 2026 vacancy-scoped employer approvals (Crab Hole Liquors, CMW Enterprise, Salt & Sun, Leianna's, Hamam Spa, Dove Cove, Premier Cru)

[This PR](https://github.com/jujulaville8-droid/JobLink/pull/120) records employer approvals on record in the JobLink outreach
log, on the dates shown. Each covers the listed vacancies only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No contact details or message content are recorded.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| Crab Hole Liquors Antigua — Cashier | `0f309f2c-015e-4317-a127-0fb35602c5cd` | `4f1f3752-7453-40d1-bf45-853d1264cba5` | 2026-10-26 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Crab Hole Liquors Antigua — Shelfpacker | `89d89568-533e-4578-bdc6-d7ecd32e9af6` | `4f1f3752-7453-40d1-bf45-853d1264cba5` | 2026-10-26 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Crab Hole Liquors Antigua — Retail Sales Associate | `d1c6f9db-534b-44c6-85aa-5fd3042e4d92` | `4f1f3752-7453-40d1-bf45-853d1264cba5` | 2026-10-26 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Crab Hole Liquors Antigua — Merchandising Specialist | `ea373994-ba6d-466a-8fc7-d7c636c1278a` | `4f1f3752-7453-40d1-bf45-853d1264cba5` | 2026-10-26 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| CMW Enterprise — Italian-Speaking Tour Guide | `21b4965b-27a8-4a6c-a93a-c1bcf9ad08c5` | `68fada5b-040a-4c46-ba37-245c37f1bef9` | 2026-10-28 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Salt & Sun Antigua — Café Assistants | `2322e19f-df88-4daa-aebf-73e6df279a7f` | `c22443ac-bdb9-4702-81dd-9783ec08dd23` | 2026-10-23 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Leianna's Bar Restaurant and Jazz Lounge — Experienced Chef | `2a9263d9-3dd7-4361-b4a8-9c0411f41cb7` | `86f178fc-7b3d-48cb-aa25-19bfd6d55d4b` | 2026-10-24 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Leianna's Bar Restaurant and Jazz Lounge — Experienced Bartender | `2f7f41ac-cfc3-4503-8d74-abdbe83dc469` | `86f178fc-7b3d-48cb-aa25-19bfd6d55d4b` | 2026-10-24 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Leianna's Bar Restaurant and Jazz Lounge — Line Cook | `6fa21ae1-82d9-4657-999c-3aaa794e82ce` | `86f178fc-7b3d-48cb-aa25-19bfd6d55d4b` | 2026-10-24 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Hamam Spa — Spa Attendant | `67fb31e8-fa90-4238-ab9d-1d09007d30f3` | `8f39a6e7-bcc5-4dca-ac72-9d2a4222edd3` | 2026-10-21 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Dove Cove Comfort Suites — Housekeeper | `7018747d-7e04-4328-9d22-2b3ea59bcc67` | `97537be2-d7e4-479f-9d7e-7682ade82a59` | 2026-10-21 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Dove Cove Comfort Suites — Handyman | `74e0d726-fd41-4071-84fe-ac75b49f3342` | `97537be2-d7e4-479f-9d7e-7682ade82a59` | 2026-10-21 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| Premier Cru — Sales Associate | `fe95bdf0-1745-41b2-bd27-03b6025b3473` | `fab263c5-baf0-48db-88de-276172542634` | 2026-10-28 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

None of these listings states a public deadline, so no `validThrough` is
emitted and no closure entry is added (no automatic job closing). Stored
listing content, status and the application route are unchanged; no database
writes.

## November 3, 2026 vacancy-scoped employer approval (COLIBRI)

[This PR](https://github.com/jujulaville8-droid/JobLink/pull/120) records employer approvals on record in the JobLink outreach
log, on the dates shown. Each covers the listed vacancies only and lives in
`EMPLOYER_APPROVED_JOBS`, bound to both IDs. No company-wide permission is
claimed. No contact details or message content are recorded.
COLIBRI's employer approval recorded Oct 28 reached the site owner directly; it is kept in a separate commit for review.

| Job | Job ID | Company ID | Attested on | Employment type |
| --- | --- | --- | --- | --- |
| COLIBRI — Chef de Partie | `03cdd5df-68aa-4463-a367-04ccd83753ea` | `eda48543-634b-4687-9947-3aa970d46e97` | 2026-10-28 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| COLIBRI — Receptionist | `4f55fb36-11b3-4f25-92b5-cb0bec5072e5` | `eda48543-634b-4687-9947-3aa970d46e97` | 2026-10-28 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |
| COLIBRI — Waitstaff | `94783ec0-1666-46c8-8269-2dda50f59de6` | `eda48543-634b-4687-9947-3aa970d46e97` | 2026-10-28 | Full Time is an unconfirmed placeholder, so `employmentType` is omitted |

None of these listings states a public deadline, so no `validThrough` is
emitted and no closure entry is added (no automatic job closing). Stored
listing content, status and the application route are unchanged; no database
writes.

## November 6, 2026 vacancy-scoped allowlist (Hawksbill Resort, Fries Guys & The Side Café, Progressive Vision)

[This PR](https://github.com/jujulaville8-droid/JobLink/pull/122) records seven vacancy-scoped entries in
`EMPLOYER_APPROVED_JOBS`, each bound to both the job ID and that job's company
ID. No company-wide permission is claimed. No email message content is copied
here. None of these listings states a public deadline, so no `validThrough` is
emitted and no closure entry is added. Full Time on the page is an unconfirmed
placeholder, so `employmentType` is omitted. Stored listing content, status and
the application route are unchanged; no database writes.

Hawksbill Resort and Fries Guys & The Side Café are employer yeses. Progressive
Vision is not: no separate employer-yes document was found. Its ledger wording
is the site owner's request only.

| Job | Job ID | Company ID | Attested on | Evidence |
| --- | --- | --- | --- | --- |
| Hawksbill Resort — Beach Attendants | `263be015-34e7-48aa-81ec-8e6ee8f5fc62` | `67d73b3c-085c-497d-b790-8144f8e2d786` | 2026-11-05 | Employer yes via email to JobLink on Nov 5, 2026, for Servers, Bartenders and Beach Attendants only |
| Hawksbill Resort — Bartenders | `39ffda6c-e9c3-4e43-94cd-3b1ba59ca2c6` | `67d73b3c-085c-497d-b790-8144f8e2d786` | 2026-11-05 | Employer yes via email to JobLink on Nov 5, 2026, for Servers, Bartenders and Beach Attendants only |
| Hawksbill Resort — Servers | `8260775d-9740-42ba-9f40-dfc87cf0bfbd` | `67d73b3c-085c-497d-b790-8144f8e2d786` | 2026-11-05 | Employer yes via email to JobLink on Nov 5, 2026, for Servers, Bartenders and Beach Attendants only |
| Fries Guys & The Side Café — Customer Service Staff | `95db04ec-fd9e-44d2-881d-385e64c3580b` | `6299b0b2-c4be-4499-9d4c-435d28775729` | 2026-11-04 | Employer yes via email to JobLink on Nov 4, 2026, for Cooks, Barista/Bartender and Customer Service Staff |
| Fries Guys & The Side Café — Cooks | `e5e07984-4043-4a8c-a065-a99c381e4e5f` | `6299b0b2-c4be-4499-9d4c-435d28775729` | 2026-11-04 | Employer yes via email to JobLink on Nov 4, 2026, for Cooks, Barista/Bartender and Customer Service Staff |
| Fries Guys & The Side Café — Barista/Bartender | `fb165818-e344-46b5-a3cd-c7e64d196523` | `6299b0b2-c4be-4499-9d4c-435d28775729` | 2026-11-04 | Employer yes via email to JobLink on Nov 4, 2026, for Cooks, Barista/Bartender and Customer Service Staff |
| Progressive Vision — Optometric Technician | `e60b9e69-cfdb-4edb-b7b6-e21e22bb24f2` | `7b03f6f7-50d6-4391-b189-dd983c32f4b0` | 2026-11-06 | Site owner requested Google Jobs allowlist on 2026-11-06 for this already-live admin-posted listing (created 2026-11-03). |

The same change redacts email addresses in the `JobPosting` description only.
Visible page text and stored descriptions are left as written. That covers
addresses already present in live JobPosting markup (COLIBRI Chef de Partie,
CMW Enterprise Italian-Speaking Tour Guide, Dove Cove Housekeeper and Handyman)
and the Fries Guys apply-by-email lines, which would otherwise enter JobPosting
once those three vacancies are allowlisted.

## November 7, 2026: approvals also authorize the widened fields

The structured data consent build (migration
`20261106170000_job_listings_structured_data_consent.sql` and
`src/lib/seo/jobposting-consent.ts`) added two widened JobPosting fields:
`jobBenefits`, from the listing's own benefits list, and
`hiringOrganization.description`, from the company profile. For employer
self-posted listings these are gated on the employer's own consent recorded
through the post-job form (`job_listings.structured_data_consent`).

Admin-posted listings can never carry form consent. The site owner directed
on Nov 7, 2026 that recorded employer permission is the basis for full
markup, so from this date a recorded approval in this ledger (per vacancy in
`EMPLOYER_APPROVED_JOBS`, or company wide in `EMPLOYER_APPROVED_COMPANIES`)
also authorizes the widened fields for that listing, through the same
`getEmployerApproval` lookup that gates its base markup. The widened fields
still emit only when the underlying data exists, and both pass through the
same email redaction as the JobPosting description. Salary is not affected:
it remains gated on the employer's own `salary_visible` choice.

## November 9, 2026 vacancy-scoped allowlist (Tipsy Toast Cafe, Blends&Bitez, The Massage Goddess, CRISPA)

This change records seven vacancy-scoped entries in `EMPLOYER_APPROVED_JOBS`,
each bound to both the job ID and that job's company ID. No company-wide
permission is claimed. No email message content is copied here. None of these
listings states a public deadline or a numeric salary, so no `validThrough`
and no `baseSalary` are emitted, and no closure entry is added. Full Time on
the page is an unconfirmed placeholder, so `employmentType` is omitted. Stored
listing content, status and the application route are unchanged; no database
writes.

Tipsy Toast Cafe and Blends&Bitez are the site owner's 2026-11-09 direction
that those employers gave permission to list the vacancies below. The Massage
Goddess company is not company-wide approved: the 2026-10-19 yes still covers
only the Nail Technician vacancy (`d00f5ff5-29cf-4110-9828-a2f84e49245f`). On
2026-11-09 the owner directed that the later esthetician vacancy should carry
markup because that company-wide gap left it out. A further Massage Goddess
vacancy stays excluded until it is recorded on its own.

CRISPA's two vacancies were already recorded on
[PR #97](https://github.com/jujulaville8-droid/JobLink/pull/97) from the
employer's 2026-10-19 email to the JobLink inbox (about 1:29 PM ET). That PR
conflicts with main and is superseded by the entries here, so it can be closed.
It was not closed from this change.

| Job | Job ID | Company ID | Attested on | Evidence |
| --- | --- | --- | --- | --- |
| Tipsy Toast Cafe — Bartender / Barista | `0939b9ec-bc7a-4d0b-a9ff-ac9e85026ec0` | `0b0f5276-c2ff-4626-9c2c-c4a0222bb46d` | 2026-11-09 | Site owner: employer gave permission to list this vacancy |
| Tipsy Toast Cafe — Chef / Cook | `8226ba88-2ba5-46c6-be2f-acf4c429fa5d` | `0b0f5276-c2ff-4626-9c2c-c4a0222bb46d` | 2026-11-09 | Site owner: employer gave permission to list this vacancy |
| Tipsy Toast Cafe — Supervisor (Operations & Guest Experience) | `e184e7ee-0499-4e4e-b324-a1f78580fa93` | `0b0f5276-c2ff-4626-9c2c-c4a0222bb46d` | 2026-11-09 | Site owner: employer gave permission to list this vacancy |
| Blends&Bitez — Prep Cook | `defd0a66-f033-41ea-9cb0-119b06a74eac` | `db2a43e0-73d6-45a1-b15e-f29c1a444de2` | 2026-11-09 | Site owner: employer gave permission to list this vacancy |
| The Massage Goddess — Certified Esthetician & Nail Technician (Gel Extension Specialist) | `4708c01a-ccd2-42ee-ad4e-54c3cab98420` | `5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3` | 2026-11-09 | Site owner: this vacancy should carry markup; company is not company-wide approved |
| CRISPA Wholesale Distribution Company Ltd. — Sales Representative | `90a1af95-5173-43ce-a5b7-4307814ce881` | `08c982be-1421-4657-8394-c168a1f07d61` | 2026-10-19 | Employer yes via email to the JobLink inbox on 2026-10-19, folded from PR #97 |
| CRISPA Wholesale Distribution Company Ltd. — Office Assistant | `ef5503e9-45a2-4121-92b7-aec94b440147` | `08c982be-1421-4657-8394-c168a1f07d61` | 2026-10-19 | Employer yes via email to the JobLink inbox on 2026-10-19, folded from PR #97 |

The same change fills `addressCountry` (`AG`, already sent) and `addressRegion`
when the location text names one parish or Barbuda. Examples: Redcliffe Quay,
St. John's is Saint John; Coolidge and Paynters Estate are Saint George;
English Harbour, Falmouth and Cobbs Cross are Saint Paul. A location that is
only "Antigua", a road that is not one parish (Old Parham Road), or two
parishes at once gets the country and no region. `streetAddress`, `postalCode`,
`validThrough` and `baseSalary` are still omitted when the listing does not
have them. Search Console can keep warning on those four.

Visible job text still shows an employer email when the description contains
one. That remains the apply instruction on the seven listings already covered
by the JobPosting-only redaction tests. This change does not hide those
addresses on the page.

## November 12, 2026 vacancy-scoped allowlist (Deep Blue Antigua, Private Employer — Chef)

[This PR](https://github.com/jujulaville8-droid/JobLink/pull/131) records two vacancy-scoped entries in
`EMPLOYER_APPROVED_JOBS`, each bound to both the job ID and that job's company
ID. No company-wide permission is claimed. These entries record the site
owner's request only. No email addresses are included. No closure entry is
added. Stored listing content, status and the application route are unchanged;
no database writes.

Each stored description says the role is full-time, and `job_type` is
`full_time`, so `employmentType` is `FULL_TIME`. Neither listing has a salary
or a deadline (`expires_at` is null), so no `baseSalary` and no `validThrough`
are emitted.

Created dates, both still 2026-11-12 in America/Antigua:

- Deep Blue Antigua — Waiter / Bartender: `2026-11-12 14:38:12.823809+00`
- Private Employer — Chef — Chef: `2026-11-12 14:17:23.790696+00`

The Chef listing is not confidential. Its public company name is
`Private Employer — Chef`, and that is the `hiringOrganization` name. Logo,
website and company description are absent, so those organization fields are
omitted. Deep Blue Antigua's location is English Harbour, Antigua, so the
address is English Harbour, Saint Paul, AG. The Chef location is Antigua only,
so the address is the country AG with no locality or region.

| Job | Job ID | Company ID | Attested on | Evidence |
| --- | --- | --- | --- | --- |
| Deep Blue Antigua — Waiter / Bartender | `71dcc48c-5fd4-40de-a604-e6b83ba11ad9` | `0a924e3c-b468-4418-83fe-b23a5c86e7fd` | 2026-11-12 | Site owner requested Google Jobs allowlist on 2026-11-12 for this already-live admin-posted listing (created 2026-11-12). |
| Private Employer — Chef — Chef | `a8cb7222-575a-458d-aa03-286efb1494e7` | `b403485a-07d3-40e8-aa66-f9aecaa5636b` | 2026-11-12 | Site owner requested Google Jobs allowlist on 2026-11-12 for this already-live admin-posted listing (created 2026-11-12). |
