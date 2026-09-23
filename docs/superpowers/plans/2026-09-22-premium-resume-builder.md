# Premium Resume Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved JobLinks document workspace with responsive editing, live content preview, dependable saves, and complete exports.

**Architecture:** Keep the authenticated dashboard boundary and existing CV schema. A dedicated studio API provides owner-filtered per-record writes and checked reads. A focused client workspace owns unsaved section drafts; a shared document model supplies the HTML preview and a new PDF layout. Save feedback is explicit, failures retain drafts, and same-tab recovery supplements departure warnings. No schema migration, AI service, payment flow, or production deployment.

**Tech Stack:** Next.js 16.3.6, React 19, TypeScript, CSS modules, React PDF, Vitest/Testing Library.

**Spec:** User-approved concept and assessment in this conversation: teal/ivory three-column document workspace, mobile Edit/Preview, reliable persistence, all supported content exported. Template discussion remains deferred.

## Global Constraints

- Preserve unrelated changes and existing authentication. Work in the existing isolated worktree on `feat/premium-resume-builder`.
- No invented ATS/proficiency scores or fake controls. No AI or payment reactivation.
- Use one neutral document layout; do not replace the legacy template library.
- Contact details remain sourced from My Profile; provide a clear link rather than duplicate account data.
- Save current section explicitly; never claim unsaved input is persisted. Preserve drafts on errors and warn on departure.
- Undo/redo applies to the current unsaved editing session, not persistent version history.
- Build and test locally; no publishing in this pass.

## Task 1: Document fidelity

Files: `src/lib/resume-document.ts`, `src/lib/resume-pdf.tsx`, `tests/resume-document.spec.tsx`, `src/lib/cv-pdf.tsx`.

- [x] Write and run failing tests that a fixture containing all ten sections and twelve skills retains its content, that missing dates do not invent current employment, and that empty sections are omitted.
- [x] Implement `resumeSections(cv: CvFull): ResumeSection[]`, each entry carrying title, subtitle, detail, dates; use every supported field without truncation or proficiency inference.
- [x] Implement `createResumeDocument(cv: CvFull)` using that shared model, A4 pagination and no marketing footer. Add `studio` export theme; preserve legacy themes.
- [x] Run tests and render a real two-page all-section PDF; inspect both pages and extract text to confirm no omitted sections.

## Task 2: Focused editor and reliable saving

Files: `src/components/cv/studio/*`, `src/lib/resume-sections.ts`, `tests/resume-studio.spec.tsx`, `src/app/(dashboard)/profile/cv/page.tsx`.

- [x] Write failing interaction tests: failed save preserves typed content, successful save updates feedback, switching panels preserves drafts, preview reflects edits, existing sections remain editable, failed load offers retry.
- [x] Implement data-driven editors with accessible labels and date validation. Dedicated `/api/cv/studio` API validates entries and uses explicit owner filters. Stable UUIDs avoid duplicate retries. Confirm writes from returned rows rather than a fallible post-write fetch. Skills save individually without delete-all replacement.
- [x] Add undo/redo for unsaved edits and guarded navigation; user-keyed session storage recovers same-tab drafts after Back/Forward or reload. No persistent version history, AI, or template-picker controls.
- [x] Build responsive three-column workspace and live content preview, plus actual PDF preview/export with visible loading and failures.
- [x] Run interaction tests and scoped lint/type-check.

## Task 3: Integration and verification

Files: dashboard shell, site navigation, profile entry point, targeted regression tests.

- [x] Give the editor full available width while preserving authentication and normal dashboard layout elsewhere. Add Resume Builder navigation and profile entry point.
- [x] Test editing, successful save, preview, and no overflow at 1440/1024/768/390/320px using synthetic data. Verify real browser PDF download and modal on desktop/mobile. Interaction tests cover rejected saves and load failures.
- [x] Run all existing tests, build, and independent code review; address important findings. Profile downloads explicitly select `studio`; remove the misleading legacy completion percentage there.
- [ ] Report implemented features and any remaining verification limits without claiming a live deployment.

## Verification record

- 46 Vitest tests and 8 Node UI tests passing; TypeScript and scoped ESLint passing.
- Independent review and scoped re-review found no remaining blocking issues.
- Production build passes with project environment loaded. Local production smoke checks: `/profile/cv` redirects unauthenticated users to `/login` (307), `/api/cv/studio` returns 401, and `/login` returns 200.
- All eleven existing CV tables returned HTTP 200 for read-only anonymous HEAD checks. No customer data was fetched or modified.
- Browser harness is test-only Vite entry, not a production route/auth bypass. It uses fictional data and mocked API responses; authenticated writes to deployed Supabase have not been exercised.
- Draft recovery depends on session storage availability. It is not cross-device backup or persistent version history.
- No new dependencies, database migrations, AI activation, payment changes, or deployment.
- Full-repository lint has three pre-existing `set-state-in-effect` errors in messages/page, auth/verify-confirm/page, and messaging/ComposeBox, outside this change.

## Repeating browser verification

Run `npx vite --config tests/browser/vite.config.ts`, then `RESUME_TEST_OUTPUT=/absolute/artifact/directory node tests/browser/check-resume.mjs` with Playwright installed. A separate installation can be supplied as `PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs`. The test uses Chrome in headless mode.
