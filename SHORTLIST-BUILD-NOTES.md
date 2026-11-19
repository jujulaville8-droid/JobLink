# Employer shortlist build notes (branch eve/employer-shortlist)

Built 2026-11-19 from BUILD-BRIEF.md. Nothing is committed; all changes are in the working tree.

## Files

Created
- `supabase/migrations/20261119000000_shortlist_overrides.sql`: `shortlist_overrides` and `shortlist_opens` tables. RLS is on for both. Each table has select, insert, update and delete policies limited to `employer_id = (select auth.uid())`. The insert and update policies also check that the application or job belongs to a company the caller owns. Access is revoked from anon and public, and the indexes are created. Not applied to any database.
- `src/lib/shortlist/ranking.ts`: pure ranking library. It contains `buildShortlist`, `applyNewMarkers`, `visibleEntries`, `toClientEntry` (strips the score), `shortlistProgress`, `computeJobQueue`, and the skill/keyword matching.
- `src/lib/shortlist/load.ts` (server-only): `loadShortlistData`, `loadHiringQueue`, `loadVerdictInfo` (verdict kind + text), `loadOverrides`, `loadLastOpened`, `recordShortlistOpen`. If anything fails, these return empty results instead of throwing.
- `src/app/api/shortlist/overrides/route.ts`: POST adds an override and DELETE removes one; both take `{applicationId, action}`. Auth uses `requireVerifiedUser`, and ownership is checked the same way the status endpoint does: application → listing → company owned by the user.
- `src/app/(dashboard)/my-listings/[id]/shortlist/page.tsx`: the triage page (server).
- `src/components/shortlist/`: `VerdictChip.tsx`, `ShortlistBoard.tsx` (desktop list), `CandidatePanel.tsx` (slide-in panel on desktop, full-screen sheet on mobile), `MobileReview.tsx` (one card at a time), and `shared.tsx` (actions hook, action buttons, avatar and markers).
- `tests/shortlist-ranking.spec.tsx`, `tests/shortlist-ui.spec.tsx`, `tests/shortlist-overrides.spec.tsx`.

Changed
- `src/app/(dashboard)/dashboard/page.tsx`: added the "Your hiring queue" section inside `EmployerDashboard`, between the header/actions nav and Quick Stats. Nothing else in the employer dashboard changed, and the seeker and admin dashboards were not touched.
- `src/app/(dashboard)/my-listings/[id]/applicants/page.tsx`: added one "Shortlist" button under the header. Nothing else changed.

Not touched: `src/lib/employer-screening/*`, the screener, its prompts, verdict wording, emails, and the seeker and public pages.

## Deviations and judgment calls

- **No Verified badge.** Seekers have no identity-verified flag, so the badge is left out everywhere, as the brief's verified-facts section says.
- **Keywords come from title + description + category.** `job_listings` has no requirements column.
- **The API uses `requireVerifiedUser`**, as the verified-facts section says. Section 4 of the brief still mentions the older `requireAuth`; I followed the verified-facts section.
- **Missing tables.** If `shortlist_overrides` is missing (codes 42P01 or PGRST205, or the client throws), the API returns 200 with `{persisted:false}`. Other database errors return 500, so a real failure is not silently reported as success.
- **Interview action.** It calls the existing status PATCH (so the applicant gets the same notification) and then POSTs an `interview` override. It skips the confirmation modal, which the brief accepts. Once an application is already at interview, the button reads "Interview requested" and is disabled.
- **Pin and Pass.** "Save for later" toggles: it POSTs the pin, or DELETEs it if the candidate is already pinned. "Pass" is excluded from the ranking even if the candidate is pinned, because the employer's explicit remove wins. Passed candidates show under a collapsed "Passed (N)" list with Restore buttons, on desktop only.
- **"New" markers.** Fixed after the initial build (coordinator change): `recordShortlistOpen` is throttled (OPEN_RECORD_MIN_AGE_MS, 15 minutes), so in-visit refreshes from triage actions no longer clear the markers; they clear on a genuinely later visit, as the spec intends.
- **Mobile.** Frame 3 has no H1, progress line or "Interview first" header, so those are hidden below md and the mobile view supplies its own job selector, banner and progress bar. Each mobile card has a "View profile" link that opens the same CandidatePanel as a full-screen sheet. Touch swipe is implemented (60px threshold) in addition to the required arrow buttons.
- **Unscreened candidates.** Applications with no verdict row show a neutral "Not screened" chip and sit in a group after not_a_fit.
- **Hiring queue.** It lists jobs of any status with at least one application, capped at 8, with a "See all N roles in My Listings" link when there are more. The top card gets the highlight and the "Needs attention" chip only when it has new or strong-fit counts.
- **Data kept off the client.** Seeker phone numbers are not loaded into the shortlist entries sent to the client; contact goes only through MessageButton and `/api/cv-download`.
- **cv_skills fallback.** If the `cv_skills` column is missing (its migration ships separately), the applications query is retried without it.
- **Dates** use a fixed `America/Antigua` time zone so the server render and hydration match.
- **Extra test.** `tests/shortlist-overrides.spec.tsx` also runs the migration in PGlite and checks the RLS behaviour (foreign employer blocked, owner allowed, anon denied, check constraint enforced).

## Internal match score (never displayed)

The job keyword set is built by tokenising the job title, description and category: lowercase, split on non-alphanumerics, drop short words and stopwords, then apply light suffix stemming so "bartending" and "bartender" match. The candidate's skills are the profile `skills` plus any `cv_skills` not already listed, de-duplicated case-insensitively. Each skill is tokenised the same way and checked against the keyword set:
- every token found: 1 point
- only some tokens found: 0.5
- any token also in the job title: +1

The score is the sum over matched skills plus 0.1 × experience_years (capped at 10 years, so at most 1). It is used only to order candidates inside the good_fit group, with ties going to the newest application. Other groups are ordered newest first. The score is stripped by `toClientEntry` before anything reaches a client component. A UI test checks that the fixture score values never appear in the rendered output and that the client payload has no `score` key.

## Results

- `npx tsc --noEmit`: clean.
- `npx eslint` on all new and changed files: clean.
- New tests: `shortlist-ranking`, `shortlist-ui` and `shortlist-overrides` (7 tests, including the PGlite RLS one) all pass.
- Related existing suites, run together with the new ones (employer-screening*, employer-fit-verdict-store, employer-analytics-* including the dashboard navigation assertions, employer-home-entry, employer-phase2-surfaces, admin-applications-*, applicant-*, application-*, confidential-employer, cv-authorization-api, messaging-*): 57 files, 1614 tests, all passed.
- `npm run build`: succeeded; `/my-listings/[id]/shortlist` and `/api/shortlist/overrides` are in the route output.
- Full `npx vitest run`: 182 files passed, 1 skipped; 3506 tests passed, 1 skipped (the skip already existed); exit code 0.
