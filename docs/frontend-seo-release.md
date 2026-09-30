# Frontend and SEO release — September 30, 2026

This integration starts from main `0e09b94` and combines the candidate preview
from `a1f8f3f`, scoped vacancy approvals from `07dd2d9`, the category normalization
in Library `joblink-category-seo.patch` (version 0), and reconstructed employer
self-service homepage entry points.

Anonymous homepage employer CTAs lead to `/signup?role=employer`. Signed-in
employers keep `/post-job`; other signed-in users keep `/dashboard`. The separate
candidate preview retains `/members` signup/sign-in continuation. Hiring help
remains available as a secondary link. Decorative cards contain no real profiles.

Metadata, results and selected filters now share canonical industry spelling.
Unknown categories remain filters and remain noindex; they never widen to all jobs.
Only the two approved MOfit/Woodstock vacancies gain JobPosting markup. Existing
self-posted jobs and Top Bun approval remain unchanged. Woodstock's date-only
deadline is `2026-10-29`; no employer cutoff time is invented.

No database, auth, permission, billing, credential or migration changes are part
of this release. Company claim PR #17 stays separate and requires its own
migration/security review. A local `git merge-tree` compatibility check does not
apply or release that branch. No live accounts or messages are created by testing.

## Validation

- 218 unit/component tests passed; one existing test skipped.
- 34 Node tests passed.
- Production build and TypeScript passed against a read-only localhost fixture.
- ESLint: zero errors, nine existing warnings.
- 42 candidate-preview browser checks passed at 320, 390, 768 and 1440 pixels,
  including keyboard navigation, pause/resume, reduced motion, no JavaScript and
  synthetic account gates. Fixture behavior does not establish live RLS behavior.
- Visual review identified and fixed CTA wrapping; desktop card actions also
  reveal on keyboard focus. Final preview/production checks are recorded in the
  release PR and task evidence.

Source task notes in `homepage-talent-preview.md` and `jobposting-approvals.md`
describe their original pre-integration validation. Valid markup does not promise
Google indexing, eligibility for a particular display, or ranking improvements.
