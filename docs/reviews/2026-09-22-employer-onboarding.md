# Dashboard polish and employer onboarding review

## Implemented

- Dashboard route transitions no longer retain a transform that changes fixed-dialog positioning or remount the page subtree. Pending navigation clears correctly when the pathname changes, including Back navigation.
- Employer signup uses one password field with a visibility toggle, preserves verification, validates URL-supplied roles, and recovers from signup/Google network failures.
- Verification email resend uses the existing onboarding redirect, includes a cooldown after a successful resend, and reports failures accessibly.
- Company setup leads with company name, clearly labels optional industry/location, and places logo, description, and website in an optional disclosure. New employers see progress and no Pro upsell.
- Website entries accept bare domains, normalize them to HTTPS, and reject non-HTTP(S) protocols and embedded credentials. Validation focuses the invalid field.
- Logo processing preserves the entire image rather than cropping wide wordmarks. Saving waits for uploads, freezes edits during persistence, and verifies the saved database row.
- Failed company loads offer retry instead of displaying an empty creation form. Failed saves retain the user's entries. First-time saves continue to `/post-job`; existing profiles stay in edit mode.
- Returning employers who reach `/post-job` without a company are routed into setup. Connection failures are handled separately.
- Mobile onboarding inputs use 16px text; signup cards and buttons use valid rounded-corner classes. Existing JobLink colors and visual identity are retained.

## Verification

- `npm run test:ui`: 8 passed.
- `npm run test:onboarding`: 17 passed, using mounted React components and mocked external auth/database boundaries.
- Production Next.js build and TypeScript validation passed.
- Scoped ESLint: no errors; one pre-existing image-optimization warning in the job-post preview.
- Independent code review: no remaining must-fix findings in the reviewed changes.
- Desktop (1280px) and mobile (390px) browser checks: company component setup, optional website normalization, first-save destination, signup/password visibility, verification resend, 16px mobile inputs, and no horizontal overflow. Company checks used an isolated fixture with the real component and compiled application CSS.
- Built Next.js employer signup checked at both widths, with mocked auth responses and no browser runtime errors. No production accounts were created and no real verification emails were sent during these onboarding checks.

## Release limitations

These changes are merged locally, not pushed or deployed. A live verification-email round trip, OAuth-provider redirect, and authenticated database/storage smoke test remain to be performed before release.

The repository has pre-existing broad lint failures. The dependency audit also reports vulnerabilities in existing dependencies, including a critical advisory for the installed Next.js version. Production dependencies were not upgraded as part of this UI change. Address those advisories and rerun release validation before deployment.

Unrelated user changes, including `scripts/discover-businesses.ts` and untracked assets, were preserved.
