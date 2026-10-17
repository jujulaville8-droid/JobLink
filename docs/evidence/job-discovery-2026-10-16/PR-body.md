Suggested title: Restore mobile Apply and preserve job search context

The mobile job-detail Apply bar disappears during scrolling because its animated ancestor retains a transform. Move fixed UI outside that container, keep clearance above navigation/support, and disable entrance transforms for reduced motion.

Preserve validated application context when a visitor creates an account, continues with Google, verifies email or completes the existing profile/CV flow. Keep the existing return-destination validator and reject external/ambiguous destinations. Signup links preselect the seeker role for applications.

Make location editable and independently clearable in job search, preserving other filters and resetting pagination. Display missing recorded work locations honestly and stop substituting company HQ for JobPosting locality/remote status. Preserve all search criteria through alert signup and clearly explain the matcher’s supported criteria; location and company-name matching are unsupported, and multiple job types require explicit setup.

Also associate industry labels/selects, name pagination links and mark the current page, add a keyboard skip link, and improve secondary text contrast.

Validation: 1,547 unit/component tests pass, 1 existing live-email test skipped; 44 Node tests pass; TypeScript and production build pass with CI placeholder values; ESLint has 0 errors and 6 existing navigation warnings. A Chromium fixture using actual UI and synthetic backend/auth passes 24 cases across 320–1440px, both motion preferences, scroll positions, navigation/support clearance, auth destination continuity, location edits, filter/pagination semantics and skip-link focus. Screenshots, source hashes, logs and exact live-versus-fixture observations are in `docs/evidence/job-discovery-2026-10-16/README.md`.

Live English Harbour search still needs employer-confirmed recorded work-location data; no database backfill or inferred work location is included. Real OAuth/email delivery, deployed authenticated integration, physical iOS safe areas/keyboard behavior, WebKit and 200% browser zoom remain unverified. No purchase files, dependencies, schema, expiry/deadline, salary/type/approval rules, credentials or live settings are changed.

Hold merge/deployment pending parent evidence review. Automatic Vercel and Netlify previews must be accounted for before publishing this local branch.
