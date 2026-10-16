# JobLink discovery and application batch — 2026-10-16

Implemented in a fresh isolated clone at `/Users/julianlaville/Documents/Codex/2026-10-16/task/JobLink-audit`, branch `fix/job-discovery-auth-mobile`, starting from current main `e086afb36c7f3d64be9a6fbd3f84aea7c821e5dd` (re-fetched before handoff). The résumé purchase owner's checkout and purchase files were not accessed or changed.

## Changes

- Mobile Apply is a sibling of the animated detail content. Its fixed position no longer inherits the final identity transform. It has clearance above bottom navigation and remains registered with support's obstruction measurement. Reduced motion disables the entrance transforms.
- Login's **Create one** preserves the exact validated UUID application destination and preselects seeker signup. Email signup, resend, Google callback, verification, session recovery and the existing application/profile/CV flow retain context. A validated metadata routing hint handles email templates or devices that omit the return URL; it is cleared after verification. The existing `return-to.ts` validator is unchanged. Onboarding admits only existing member/claim destinations, `/jobs` search URLs and exact UUID application paths.
- The jobs search has an editable, independently clearable location. Search/filter/pagination changes retain other URL criteria and reset pagination appropriately. Location normalization trims/collapses whitespace and escapes literal LIKE characters; it does not infer spelling aliases, parse descriptions, or use company HQ as work location.
- Missing job locations display **Location not provided** in cards and detail. JobPosting locality/remote status uses only the listing's own location. Existing company HQ remains visible as company information.
- Alert signup now uses the supported `returnTo` parameter and retains location and every selected job type. Copy explains that alerts match title/description keywords, industry and one job type, without location/company-name matching. Multiple job types and location-only searches lead to explicit alert setup; no unsupported criteria are silently submitted.
- Industry labels point to unique selects even when both responsive copies exist. Job types use a fieldset/legend. Pagination has named links and `aria-current`, the root layout has a keyboard skip link, and secondary text tokens have measured contrast of 5.01:1 or better on the three standard light surfaces.

## Live observations versus local proof

Read-only production observations are in [live-observations.json](live-observations.json). At 390×844, Kitchen Staff's mobile Apply top was 1262.5px at scroll top and −106.5px at scroll end: outside the viewport in both cases. Its ancestor retained `matrix(1, 0, 0, 1, 0, 0)`. Login's **Create one** was `/signup` despite an application `returnTo`.

The live English Harbour location search had no matching jobs. `chef` returned four jobs including Trappas. Kitchen Staff (`ab781b7c-5c68-404f-bb7c-479a8b58264f`) had a blank location pill, English Harbour in its description and company information, and no JobPosting block. These observations do **not** establish an employer-confirmed work location. The public DOM cannot distinguish null/empty/whitespace storage.

Schema inspection shows nullable, separate job/company `location TEXT` fields. Search applies `ilike` only to the job field; description/company text is used by keyword search. Thus a missing recorded job location remains absent from location-only search. No database read with credentials, backfill, location invention, expiry/deadline, salary, employment-type or approval change was made.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | Pass (also checked by final production build) |
| ESLint | 0 errors; 6 existing navigation warnings |
| Full Vitest suite | 1,547 pass; 1 existing live-email test skipped |
| Node tests including PGlite security/claims | 44 pass |
| Production build | Pass; 113 pages generated, CI placeholder values only |
| Responsive Chromium fixture | 24 cases pass; no page errors, external requests or writes |

The normal `tsx --test` launcher cannot create its IPC socket in this sandbox; the same six test files passed with `node --import tsx --test`. The build's placeholder `example.supabase.co` fetch warning is retained in [build.log](build.log); no live credentials were used. No PostgreSQL concurrency service or real email/OAuth transaction was exercised.

[browser-report.json](browser-report.json) records widths 320, 375, 390, 414, 430, 768, 1024 and 1440, both motion preferences, top/middle/end scroll positions, Apply/navigation/support bounds, support open/close, Apply→login→signup→OAuth URL continuity, location edit/clear, filter associations, named/current pagination and skip-link focus. Changed source hashes are in [source-sha256.json](source-sha256.json).

The fixture imports the actual detail function, Apply, search, filter, pagination, login, signup, bottom-nav and support components. Backend/auth are synthetic and all non-GET/external requests are blocked. It uses system fonts and a lightweight shell instead of the full Next layout. These are fixture results, not proof of deployed integration, real OAuth/email delivery, physical iOS safe areas/keyboard behavior, WebKit, or 200% browser zoom.

Screenshots: [390px scrolled detail](mobile-detail-390.png), [320px search](search-320.png), [390px login](login-390.png), [390px support](support-390.png).

To reproduce, run `./node_modules/.bin/vite --config tests/browser/job-discovery-vite.config.ts`. The exported function in `tests/browser/check-job-discovery.cjs` accepts a Playwright Page. With Playwright MCP, load the function via `browser_run_code_unsafe` and call it with `page` (or use a standalone Playwright runner). It performs only local fixture interactions.

## Review and publication hold

The branch and commits remain local. The PR text is prepared in [PR-body.md](PR-body.md); **no PR exists yet**. Recent [PR #63](https://github.com/jujulaville8-droid/JobLink/pull/63) contains both Vercel and Netlify automatic preview deployment bot confirmations. Pushing/opening this batch could therefore deploy it before parent review. No push, merge, deployment command, settings or credentials change was made. Parent should review this evidence and resolve the preview-deployment hold before publishing the branch/PR.

Remaining report work: employer-confirmed missing work-location data; any future backend location/multiple-type alert support; authenticated integration QA for saved jobs, alerts, messages, application status, hiring help and admin analytics; full device/WebKit/zoom validation. Stripe link/purchase work remains with its separate owner.
