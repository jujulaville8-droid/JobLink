# JobLink brand naming

The accepted product name is **JobLink**: singular, one word, capital J and L.
Use it in customer-facing navigation, page copy, accessible labels, metadata,
structured data, resume export footers and future email sender names, subjects
and template copy. Keep the existing logo artwork; its wordmark already uses
this spelling. `JobLink Pro` and `JobLink Antigua` retain their qualifiers.

## Editing boundaries

Treat brand copy and technical identifiers separately. Do not run a repository-wide
replacement. Preserve domains, literal URLs (including mailto query strings),
email addresses, bundle IDs, URL schemes, Expo slugs, Xcode project/target names,
API routes, database keys and browser storage keys. In particular, existing
`joblinks_template_*` and `joblinks:resume-draft:*` keys remain compatible.

Employer-written descriptions and testimonial text are content supplied by
others. Display their original text without normalizing its spelling. The six
existing exact-match vacancy fallbacks in `public-vacancy-description.ts` have
JobLink-written application paragraphs; only their brand word changes. Original
source descriptions, listing/company IDs, source links and exact-match guards
remain intact. Later employer edits still win.

Email source changes affect future messages only. Do not resend messages or edit
sent correspondence, including Ahmed's creative handoff. The historical
CasaRoots feedback script, retired discovery script, dated September 22 plan and
October 10 application-copy audit retain their original text. Tests using
employer-authored sample feedback also retain that text. The generated employer
follow-up mailto subject retains its literal URL contract.

The repository's signup/password-reset HTML templates are updated source files;
this does not update hosted Supabase templates. Their separately reviewed
publication remains an integration task. No database migration, credential,
new permission, dependency or deployment is part of this naming correction.

## iOS owner handoff

Website `main` at `10f3368112d0d735151f43e6ec543f511a0220ca` does not include
the active native workspace. No native owner files are modified by this branch.
A separate display-string patch and SHA-256 manifest were prepared from read-only
snapshots of the owner's isolated local-test source on October 13, 2026.
The owner should check/apply the patch against current work, then run native
checks and rebuild. Preserve the visible **Local Test** qualifier.

| Native source | Display copy requiring integration |
| --- | --- |
| `mobile/app.json` | `expo.name`: JobLink Local Test; preserve slug, scheme and bundle identifier |
| `mobile/ios/JobLinks/Info.plist` | `CFBundleDisplayName`: JobLink Local Test; preserve all other keys |
| `mobile/src/AccountScreens.tsx` | Support labels, profile eyebrow, website/account help; preserve the mailto URL |
| `mobile/src/LegalDocumentScreen.tsx` | Contact alert label |
| `mobile/src/legalDocuments.ts` | Platform-name mentions in maintained legal display text |
| `mobile/src/JobReport.tsx` | Report recipient explanation |
| `mobile/src/messagingSafety.ts` | Blocking scope explanation |
| `mobile/src/BlockedUsersScreen.tsx` | Block list and unblock explanations |
| `mobile/src/MessagingSafetyScreen.tsx` | Conversation report explanation |
| `mobile/src/publicJobSnapshot.ts` | Five known JobLink editorial application paragraphs only |
| `mobile/src/fixtures.ts` | Two synthetic job-profile descriptions |

The owner's application-confirmation text, library sign-in text, local
notification title and corresponding UI-test title checks already used the
singular name at the final snapshot; they are excluded from the remaining patch.
Do not rename `JobLinks.xcodeproj`, targets, archive paths, custom URL schemes or
historical iOS handoff evidence. Update maintained native README/store draft
prose during the owner's integration, preserving the technical paths embedded
there. Native build/device verification belongs to that owner.

## Verified website scope

The naming edit changes 214 exact brand occurrences in 63 reviewed existing files.
This document and the README link document the ongoing convention. Each existing
file was compared with the fresh-main source to verify only the approved brand
word changed, with literal URLs and protected fixtures/keys preserved.

Checks: 143 focused baseline tests; final TypeScript check; ESLint with zero
errors and nine existing warnings; 1,358 unit/component tests passed, one existing
live-email test skipped; 34 Node tests passed using `node --import tsx --test`.
The production build passed with the existing CI placeholder values. The existing
Chromium and WebKit support browser regressions passed, including launcher toggle,
fade, draft retention, focus, reduced motion and intercepted submission behavior.
No email was sent. The iOS patch applied cleanly to copied source and matched its
11-file hash manifest; this is not a claim of native build or device testing.
