> Historical checkpoint. Superseded by README.md and the final verification report; retained for traceability.

# Offline delivery milestone

This is local foundation code, not a deployed queue. No application route, scheduler,
provider client, database migration, storage capture or credentials are added here.
The existing live forwarding path is unchanged. The disabled constant is still a
documentation marker, not a deployment feature flag.

## Implemented

- Validated, deeply frozen email content: sender, recipient, Reply-To, subject,
  HTML, nullable résumé version/hash and zero or one immutable private attachment descriptor.
- Deterministic SHA-256 across canonical serialized content. Retry reads verify
  that digest; transport receives a detached, frozen copy. Changing Reply-To,
  recipient, sender, attachment descriptor or rendered content invalidates it.
- Attachment byte-count/SHA-256 verification helper for the future storage adapter.
  A descriptor is not proof storage is immutable or private; that remains a gate.
- Separate transport outcomes: accepted, known not sent, uncertain, permanent
  rejection, rate limit, concurrent idempotency conflict, payload conflict.
- Only known-not-sent and explicit rate limits are eligible for bounded retries.
  Unknown acceptance and concurrent conflict require reconciliation. Payload drift
  requires operator review. No alternate direct sender is called on any failure.
- Retry horizon derives from persisted first-send time, not current claim time:
  strictly before 23 hours, maximum four total attempts. Provider retention and
  error classification must be verified before connecting an actual adapter.
- `startSend` receives exact digest and timestamp for authoritative CAS checks.
  `finish` returns a CAS success boolean. A lost finish never claims persistence
  success and does not fall back to another send.

## Required durable-store semantics

All operations must execute atomically. The interface is a contract, not a durable
implementation. Fake stores in tests do not prove PostgreSQL concurrency or RLS.

1. Insert application and unique application/purpose outbox row in the same
   transaction; derive job/company/applicant ownership from trusted joins. An
   uncertain commit must be reconciled by application identity, never followed by
   a legacy direct send. Production activation must select exactly one send path.
2. `claim(now)` returns only due pending or expired pre-send work, with a fresh
   unpredictable token, lease expiry and validated immutable fields. Never reclaim
   sending/uncertain for delivery. Return attempts before this attempt and original
   `firstSendAt`, if any. Acquire a lease adequate for bounded screening.
3. `freeze(id, token, email)` checks live lease using the database clock, preserves
   the first payload, stores canonical JSON and digest. It may accept an identical
   repeat but must reject any replacement. It must also validate trusted recipient,
   sender, Reply-To, attachment/application ownership and snapshot identities.
4. `startSend(id, token, digest, now)` checks live token, ready/claimed state,
   immutable stored payload digest, current employer eligibility and unchanged
   recipient routing. Any route change blocks for review, even if the new address
   is valid. Use authoritative database time, not a caller-controlled timestamp,
   to enforce original first-send time plus 23 hours and attempt limit. Atomically
   set first-send time only once, increment attempts and enter sending before
   returning true. Return false without sending on refusal. Expired horizon,
   invalid recipient or exhausted attempts must transition to blocked/review,
   rather than silently leaving claimable work. Do not rewrite the frozen payload.
5. `finish` CAS requires the current token, live lease and sending state. Accepted
   stores provider ID (acceptance is not inbox delivery). Known unsent/rate-limited
   may go pending only at a valid supplied retry time, rechecked against original
   first-send horizon and attempt limit. Otherwise blocked. Unknown/concurrent
   conflict goes uncertain/reconciliation; permanent/payload rejection goes blocked.
   Stale false or write failure leaves sending for watchdog reconciliation, never
   pending. No plaintext résumé or arbitrary provider bodies in diagnostics.
6. Watchdog converts expired sending to uncertain, not claimable. Reconciliation
   must require provider acceptance evidence, or definitive not-sent evidence plus
   unchanged payload/recipient, remaining attempts and the original retry window.
   No proof or an expired window stays blocked for review. Fencing protects database
   writes, not external exactly-once delivery; provider idempotency remains necessary.

## Explicit gaps before production

Separately validated baseline forwarding envelope independent of corrupt screening,
private immutable storage capture, application-time rubric approval, byte extraction,
PII minimization, real provider error mapping, durable store/migration/CAS concurrency
and tenant-isolation tests, recipient revalidation, receipt reconciliation, operational
watchdog, feature gates default OFF, credentials/cost approval and synthetic evaluation.
`processNext` still safely stops on corrupt snapshots/composition/persistence errors;
it cannot yet guarantee baseline forwarding in those cases. No real applicants or
API calls were used to implement this milestone.

## Baseline compatibility correction (offline)

Verified against existing `src/lib/applicant-notifications.ts` and `src/lib/email.ts`:
attachment download/render failures still forward contact details with `cv_attached:
false`; invalid/missing applicant email omits Reply-To; the sender is exactly
`JobLink <notifications@joblinkantigua.com>`.

The envelope now permits zero attachments only with explicit null résumé version
and hash. One attachment still requires matching non-null résumé metadata. No
placeholder résumé or fabricated hash is created. The absent-attachment state is
covered by the payload digest. The composer must derive `cv_attached` from the
validated attachment count, not from a profile URL or an assumption.

Omitted or null Reply-To canonicalizes to null before hashing. A future transport
must omit the provider Reply-To field for null; it must not supply an invented
fallback address. Invalid non-null email remains rejected. The exact existing
JobLink display-name sender is allowlisted; bare email addresses remain valid for
synthetic fixtures. Arbitrary display-name forms and CRLF injection are rejected.
The durable adapter must still authorize the sender, not merely validate syntax.

IMPORTANT: `QueueItem` and `processNext` still require a genuine valid screening
snapshot. The tests exercise no-attachment/no-Reply-To forwarding when a previously
captured synthetic snapshot exists, such as attachment delivery becoming unavailable.
They do not solve the case where résumé evidence/snapshot was never available.
That case must use a separately validated application baseline envelope independent
of screening, with unavailable report and no invented résumé snapshot. It remains
a production release blocker. No live forwarding path was modified.
