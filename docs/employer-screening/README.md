# Employer-email screening foundation (LOCAL ONLY)

Built against main `67f977d` on 2026-10-21. No release, provider connection,
private applicant reads, database migration, or email send is included.

## What works locally

- Immutable serialized application/job/rubric/evidence snapshots with an integrity
  hash. Strict schemas reject extra fields such as name, age and family status.
  Evidence is job-relevant, pre-minimized, applicant-reported text with source labels.
- A job-specific, versioned approved rubric totaling 100 points. Numeric results
  are deterministic; the injected processor returns criterion findings and existing
  evidence IDs, not a score or arbitrary generated quotations.
- Supported points, unresolved points, evidence coverage and a provisional range.
  Unknown does not mean failed. The score is neither a hiring recommendation nor
  a probability of performance. Unreadable/failed/absent processing is unavailable,
  never a zero score. Certification verification remains explicit.
- An injected processor, disabled/unconfigured provider adapter, bounded attempt
  and submission-age deadline, abort signal, and fail-open unavailable report.
  Late results are discarded against an immutable cutoff. Abort is cooperative,
  not hard CPU preemption; isolated production workers must bound blocking work.
- A queue-worker contract with atomic claim/fencing, frozen email reuse, stable
  `application/{applicationId}/employer` idempotency key, provider acceptance ID,
  bounded retries for *known unsent* failures, and no blind uncertain-send retry.
- Report rendering inside `new_applicant`, not a second email. No applicant report,
  dashboard, application status update, auto-rejection or filtering.
- Synthetic fixture-generated HTML previews and tests. These are not real AI
  processing and are not claims of semantic scoring accuracy.

`EMPLOYER_SCREENING_ENABLED` is an immutable false documentation marker describing the disabled
state, not an executable guard. It cannot be turned on by an environment variable. The current apply route,
notification sender and Resend helper are UNCHANGED. Nothing calls this worker in
production. The new template section is absent unless a validated report is given.

## Important limits

This is a tested foundation, not an operational screener. `OutboxStore` is a
contract, with a synthetic in-memory test double, NOT a durable production adapter.
The proposal below is not an applied migration. There is no parser, OCR, model,
watchdog/cron, storage versioning or reconciliation client yet. No feature flag can
make these nonexistent integrations work. Do not wire this to live applications.

The local worker only fails open for processor errors. Corrupt snapshots, composition
errors, or persistence failures stop the worker before sending; unit tests prove this
safe stop, not eventual forwarding. Before production, persist an independently
validated baseline forwarding envelope at application acceptance and implement
recovery/operator-review states for these failures. Never reconstruct recipients
or résumé attachments from corrupt screening data.

A source reference only establishes that a quotation exists, not that its meaning
supports a requirement. The future processor needs semantic evaluation, adversarial
résumé tests and human-reviewed calibration before production. A strict input
schema excludes sensitive *fields* but cannot detect sensitive text hidden in an
allowed excerpt. Actual source adapters must minimize/redact and evaluate this;
never send the full admin profile, references, cover letter or raw résumé by default.
The `approved` fixture marker is not employer authorization: production must load
rubrics from an access-controlled, reviewed source rather than trust request JSON.

## Required production design, before activation

1. Approve the provider, exact minimized applicant-data destination, candidate notice,
   retention/deletion, cost limits and job-specific rubric/display. Real provider
   credentials or new persistent access require separate approval. No historical
   rescoring. Consultation purchases/bookings cannot affect points or visibility.
2. Implement a transactionally inserted outbox + application snapshot. Preserve
   existing applicant acknowledgement/conversation behavior. Replace the existing
   direct employer-forward call with this ONE pathway; never run both. Snapshot
   capture failures must still queue an unscored forward, not lose the application.
3. Copy exact résumé bytes into immutable private versioned storage, verify digest
   at capture and attachment, and freeze job/rubric. The current type's version/hash
   are metadata, not proof bytes were captured. Use the same bytes for extraction
   and the attachment; set CV-attached truthfully. Keep existing validated employer
   routing and banned-user checks; freeze the validated recipient only at sending.
4. Implement atomic durable `OutboxStore` transitions described in
   `outbox-contract.md`, private tenant binding, strict service-role access,
   privacy-safe logs, retention and access revocation handling. Preserve Reply-To,
   normal contact data and résumé attachment in the same email. `FrozenEmail` is a
   preview envelope; production must extend it with immutable reply-to and private
   attachment descriptors, not mutable storage URLs.
5. Implement an email transport that distinguishes provider rejection (known unsent)
   from timeout/network uncertainty and records provider ID. Existing `sendEmail`
   collapses these failures and MUST NOT be used unchanged as this adapter. Unknown
   acceptance requires reconciliation, including process crashes after `startSend`.
6. Add watchdog/outage alerts and explicit blocked/operator-review states. Proposed
   60s processing and 120s age deadlines are configurable prototype budgets, not
   delivery guarantees. Expired work forwards unscored; email-provider outages
   necessarily prevent delivery. Recover claimed work with fencing; never reclaim
   `sending` as a new send without reconciliation. Confirm provider idempotency
   retention/window and freeze payload across every supported retry.
7. Test tenant isolation, atomic insertion/rollback, lease expiry/races, private
   attachments/digest mismatch, recipient changes/revocation, actual extraction,
   processor injection attacks, provider outage, post-acceptance crash, unknown
   outcomes and watchdog alerts. Run a synthetic end-to-end staging pilot before
   any approved rollout. No real applicant data in tests.

## Reproduce

`npx vitest run tests/employer-screening.spec.tsx`
`node --import tsx scripts/demo-employer-screening.ts`
`npm run typecheck`

Generated previews: `artifacts/employer-screening/scored.html` and
`unavailable.html`. No credentials or external services are used by these scripts.
