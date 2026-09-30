# Homepage employer talent preview

Local implementation based on fetched `origin/main` at `0e09b94ee6ba662ce41b47c5a4b48d8ab49f3a4b`, on `codex/homepage-talent-preview`. No push, pull request, deployment, live database/settings change, real account creation or outreach.

## Behavior

A single section immediately before the existing employer section shows illustrative profile cards moving behind a frosted wall. It uses the existing Magic UI `Marquee`, JobLink's typography and palette, and no new dependencies or assets. Mobile uses one row to keep the section compact; desktop uses two opposing rows.

Anonymous visitors get `Create employer account` linking to `/signup?role=employer&returnTo=%2Fmembers`, plus sign-in preserving the same destination. Signed-in employers get `View candidates`; other signed-in roles get `Employer access`. Both signed-in paths use `/members`, which checks server state. Client auth changes the label, never authorization. Candidate routes are not prefetched by the new links.

The illustration has no candidate data source or record props. It contains only generic silhouette icons, skeleton lines and illustrative industry labels, with the visible disclosure **“Illustrative preview. No real profiles shown.”** There are no real names, photos, IDs, CVs, contacts, availability claims, activity indicators, candidate counts or live claims. Removing every visual effect cannot expose a real candidate.

Copy and links are in initial server HTML. Animation starts only after hydration, pauses on hover or keyboard focus, and has a persistent pause/resume button. Reduced motion removes the animation and hides the unnecessary control. Without JavaScript, the illustration remains still and the signup link works. Decorative cards have no focusable children and are hidden from assistive technology.

## Existing access and privacy findings (source inspection)

- `src/app/members/page.tsx` checks authentication, the database user row, ban state, auth email confirmation and database email verification before forwarding employers to `/browse-candidates`. Other roles see the existing employer account gate; the teaser never switches roles.
- Both directory and candidate detail pages use `requireRole("employer")`, including verified-auth checks, and the cookie-bound Supabase client. The directory restricts results to `actively_looking`, at least 30% complete, nonempty first/last names.
- `20260925_security_hardening_2.sql` requires an employer role and an actual company row for browsable seeker profiles, with visibility in `actively_looking` or `open`. The page applies the narrower `actively_looking` filter. Existing owner/applicant/admin policies remain untouched.
- CV endpoints preserve the existing company, active Pro or application-relationship requirements. No pricing, approval, verification, visibility or paywall rule was changed.
- No verified public-preview consent field or live availability evidence was established. A candidate's employer-directory visibility is not treated as permission to publish their information on the homepage. The implementation therefore uses clearly illustrative cards. A future live claim would need separately verified, authorized aggregate evidence; this change does not add a public aggregate endpoint.

These are repository findings, not verification of deployed database policies, production consent or current candidate availability.

## Validation

- TypeScript passed, both standalone and in the production build.
- ESLint: **0 errors, 9 pre-existing warnings**. No new warning remains.
- Unit suite: **146 passed, 1 pre-existing skip**, including 7 new teaser tests and existing Members/signup/email-verification continuity tests.
- Node suite: **34 passed** including existing local SQL security tests.
- Production build: **passed, 103 static pages generated**; homepage remains static with its existing 60-second revalidation.
- Browser suite: **42 checks passed** on the production build in headless Chrome. Includes 320/390/768/1440px widths; motion/stop/resume; keyboard order and focus; reduced motion; no JavaScript; anonymous HTML/RSC and request checks; anonymous directory/CV denial; seeker denial; verified-employer navigation; unverified and banned-account gates. No browser runtime errors.
- `git diff --check` passed.

Browser authentication uses a read-only localhost HTTP fixture and synthetic sessions, not real Supabase accounts. A synthetic private-candidate canary is absent from the public homepage and appears only after the local employer gateway flow. The fixture is **not an RLS emulator**, so browser results do not establish live RLS or identity-provider behavior. The test context bypasses CSP solely because production CSP does not permit the localhost fixture origin; production CSP is unchanged. Existing external avatar requests are blocked in tests and local Vercel analytics are stubbed. No live candidate records, services or credentials are needed.

Evidence remains locally under `output/playwright/`: `talent-preview-390.png`, `talent-preview-1440.png`, `browser-results.json`, `build.log`, `tests.log`, `final-unit.log`, `final-lint.log`, `final-typecheck.log`.

## Reproduce browser checks

Use the normal installed dependencies and a Playwright installation (the existing browser scripts also use `require('playwright')`). If it is outside this repo, set `NODE_PATH` to its `node_modules` directory. No dependency or lockfile change is required.

1. Run `node tests/browser/talent-fixture.mjs` (listens on `127.0.0.1:4318`).
2. Set only local test configuration:

   ```sh
   export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4318
   export NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon
   export SUPABASE_SERVICE_ROLE_KEY=local-fixture-service
   export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4319
   export NEXT_PUBLIC_APP_URL=http://127.0.0.1:4319
   npm run build
   npm run start -- --hostname 127.0.0.1 --port 4319
   ```

3. In a separate shell, run `node tests/browser/check-talent-preview.cjs`.
4. General validation is `npm test`. Where sandbox restrictions block `tsx`'s CLI IPC pipe, the equivalent Node command is `node --import tsx --test tests/navigation-state.test.mjs tests/dashboard-loading.test.tsx tests/button.test.tsx tests/admin-discovery-retirement.test.mjs tests/security-hardening.test.mjs`.

## Integration boundaries

Only three production files change: a new isolated component, its CSS module, and a component import/insertion in `HomePage.tsx`. The pending employer self-service CTA patch overlaps that homepage file; preserve both the new import/section and its separate CTA edits when reconciling. Existing homepage/header/footer CTA destinations are unchanged here. No global CSS, auth, API, SQL, SEO or claims files change. Claim-flow PR #17 remains separate and unmerged; its checkout was not modified.

Review and publication remain with the parent task. No implementation blocker remains. Real live-profile claims and live access-policy verification are outside the evidence gathered here.
