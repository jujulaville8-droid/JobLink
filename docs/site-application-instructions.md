# On-site application instructions

## Scope and provenance

This presentation-only correction follows the owner's October 10, 2026 request
that JobLink-written application instructions direct applicants through the site.
It changes six exact JobLink-managed records. No stored descriptions, company
contacts, application routes, mail templates, approval entries, deadlines or
listing status are changed.

The public anonymous audit on October 10 returned HTTP 200 for all ten active
listing pages. Every page had two `Sign In to Apply` links preserving its own
`/jobs/{id}/apply` destination. Seven descriptions contained explicit email-apply
instructions; two more carried source-contact facts. The six corrections below
cover the five descriptions authored in [PR #32](https://github.com/jujulaville8-droid/JobLink/pull/32)
and Woodstock's existing admin-imported record. The source description, including
any retained cutoff, must still match exactly. Subsequent employer edits win.

The five PR #32 role descriptions remain sourced to the employer adverts linked
beside their entries in `src/lib/public-vacancy-description.ts`. The application
channel is JobLink editorial guidance, not a claim that the original advert used
the website. Woodstock's source is the observed admin-imported record retained in
`tests/fixtures/approved-job-listings.json`; the source website and every other
paragraph are preserved.

## Exact public wording changes

### Star Times Adventure Tours: Driver Guide

[Listing](https://joblinkantigua.com/jobs/232f9e93-d28c-4e8b-bdb5-3c85093e61d6)

Before: How to apply: email your CV to Ceostartimesadventuretours@gmail.com.

After: How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks.

### MOfit Gym and Fitness Centre: Gym Attendant

[Listing](https://joblinkantigua.com/jobs/318d3b16-6aff-453c-b0d3-fc5f2d779783)

Before: How to apply: send your CV and a short note to mofit268@outlook.com.

After: How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Add a short note in the cover letter field.

### Nobu Barbuda: Executive Chef (Japanese & Peruvian cuisine)

[Listing](https://joblinkantigua.com/jobs/0d1245af-a425-4a7f-b670-15dc8c275993)

Before: How to apply: email EMANOUSOU@NOBUHOTELS.COM.

After: How to apply: use the Apply button on this page to submit your application through JobLinks.

### Food Brokerage Services Ltd.: Van Sales Assistant/Operator

[Listing](https://joblinkantigua.com/jobs/d4fdb396-a0b0-427d-aae0-ed756274375e)

Before: How to apply: email fbsjobsanu@gmail.com.

After: How to apply: use the Apply button on this page to submit your application through JobLinks.

### Shhatterr Shack Rage Room: Rage Room Attendant

[Listing](https://joblinkantigua.com/jobs/ade78a5c-e0f6-4f5f-8008-117d7a4b96ee)

Before: How to apply: email your CV and a short explanation of why you are a good fit to ssrageroom268@gmail.com. No DMs.

After: How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Add a short explanation of why you are a good fit in the cover letter field. No DMs.

### Woodstock BoatBuilders: Carpenter / Boatbuilder

[Listing](https://joblinkantigua.com/jobs/bb1b011d-4e5c-4005-81b6-bc70c48acf4f)

Before: How to apply: all enquiries must be by email. Send your CV/resume and any other pertinent information to office@woodstockboats.com. We will get back to all applicants.

After: How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Include any other pertinent information in the cover letter field. We will get back to all applicants.

## Deliberately unresolved or unaffected

- [Top Bun, Cook](https://joblinkantigua.com/jobs/e03a2b8c-f69b-42bb-bc43-13a5d0917291):
  `How to apply / Email topbunantigua@gmail.com to apply.` is outside PR #32's
  authored fallbacks. Its current editorial ownership and delivery arrangement
  need confirmation before this patch rewrites it. Existing markup permission
  and the known October 3 cutoff do not establish application-copy ownership.
- [AG Services, Senior Accountant](https://joblinkantigua.com/jobs/f5dd91e5-633f-4c46-a49c-4920cfd884df):
  `Contact (as posted): applications@agservices.ag` is source evidence, not an
  instruction added by the five-description release. Keep the date, attribution
  and import footer intact.
- [Epicurean](https://joblinkantigua.com/jobs/e964ae7d-cb79-4ad5-b5c4-91255c0a04d9):
  `Contact (as posted): Imcdonald@epicureanantigua.com` is likewise retained with
  the source date and import footer.
- [DataPlus, Enumerator](https://joblinkantigua.com/jobs/8a0a90f2-a169-4d2a-a83a-c25efc281e8a):
  self-service content contains no email-application directions and is unchanged.

## Safety and release boundaries

- Only exact job ID, company ID, title and original description combinations use
  the editorial fallback. Changed text, including whitespace or cutoff edits,
  is not silently rewritten. There is no general email-removal rule.
- The same helper produces the visible description, saved-job snippet, metadata excerpt and
  JobPosting description. Existing Google eligibility and `directApply: false`
  remain unchanged. FBS and Shhatterr still emit no JobPosting; Top Bun remains
  ineligible after its known cutoff.
- The application form already shares the profile resume and supports a cover
  letter. This patch does not submit an application or change the private
  `companies.contact_email` notification/resume-delivery path.
- Known source cutoffs stay stored internally; public cutoff presentation and
  manual-close-only behavior remain unchanged. All ten pages remain public.
- Publication needs only the application-code deployment. No database migration
  or data write is necessary. This local patch is not a deployment authorization.

## Adjacent existing auth limitation

The Apply link and verified existing-account sign-in retain the job-specific return path.
The login page's Create Account link and signup flow currently preserve only the
special `/members` continuation, not ordinary job application destinations. This
predates the copy correction. Ordinary application return paths are also dropped
when an existing unverified account is sent to verification. These behaviors are
not silently changed here; a complete fix
needs signup, verification and return-flow testing. No live account was created.

## Local verification

- TypeScript check and production build passed
- ESLint: zero errors; nine existing navigation warnings
- Unit/component tests: 1,137 passed; one existing live-email test skipped
- Node tests: 34 passed using `node --import tsx --test` against the same test files
- Independent review: 208 focused tests passed; no implementation blockers
- Exact production-build HTTP/DOM fixture checks: all ten pages returned 200;
  visible/schema description parity, unchanged schema eligibility, both Apply
  login destinations, source/import text, footer and private-contact exclusion
  passed. The fixture accepted only reads, with zero mutating requests.
- Interactive desktop/mobile browser checks remain unverified: standalone
  Chromium cannot create its required UNIX socket in this executor, and the
  supported cloud browser cannot reach the executor's isolated localhost.
  HTTP/DOM checks are not a substitute claim that interactive browser flows ran.

The ordinary `npm test` Node-wrapper stage hit the same sandbox UNIX-socket
restriction in the `tsx` CLI. Its 34 tests passed using Node's equivalent
`--import tsx --test` invocation without that wrapper's IPC listener.
