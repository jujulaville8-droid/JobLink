> Historical milestone, superseded by [README.md](README.md) and [final-verification.md](final-verification.md). Statements below describe the earlier prototype, not the current integration.

# Durable adapter contract (design only, not a migration)

One row per `(application_id, purpose='employer-forward')`, FK to accepted
application; tenant/job IDs derived from trusted joins, not caller parameters.
Snapshot/version references and payload hashes immutable after insertion. No
browser/anon/authenticated direct reads or writes to snapshots, scores or outbox;
use service-role server functions and employer-bound validated delivery only.
Retention and applicant access/notice require a separate approved policy.

Persist: application/job/company IDs, purpose, snapshot JSON/hash, submitted time,
processing deadline, state, next_attempt_at, attempts, lease token/expiry,
frozen_email JSON/hash including validated recipient/reply-to and immutable
attachment references, provider_id, accepted_at, last_error_code (no PII).

States:
- pending -> claimed using atomic compare-and-swap or SKIP LOCKED with a fresh
  fencing token and lease. Only due items are claimable. Attempts count sends.
- claimed -> ready, freezing exact payload once under the same live lease.
- ready -> sending atomically, validating token and lease and incrementing attempts
  BEFORE network activity. `startSend` also accepts a still-live claimed row whose
  email was already frozen by a previous known-unsent attempt.
- sending -> accepted, persisting provider ID. Acceptance is not inbox delivery.
- sending -> pending with next_attempt_at only after known-unsent failure, max four
  total sends (initial plus three retries in prototype). At exhaustion -> blocked,
  alert operator; do not silently discard.
- sending -> uncertain after network uncertainty, process crash or expired lease:
  quarantine for reconciliation. Never auto-reclaim for sending. If reconciliation
  confirms acceptance, mark accepted; if definitively not sent and within the
  provider's supported deduplication window, explicit retry may reuse frozen email.
  Otherwise operator review without a blind resend.
- Expired claimed/ready lease can be reclaimed with a new token, not the old one.
  A watchdog releases overdue screening work to unavailable-report forwarding.
  Stale workers must fail freeze/startSend/finish CAS. Late processor results must
  never overwrite frozen email or trigger a second score email.

`claim` returning an item must ensure the snapshot/application IDs match. `freeze`
returns false on stale lease; it must never replace an existing frozen payload.
`finish` is transactional and lease-fenced. Its failure leaves sending uncertain,
not pending. Expired/revoked recipient authority blocks delivery pending review,
never routes sensitive applicant data to an invented fallback recipient.

The local tests model a single in-memory claim and selected transitions. They do
not prove database concurrency, durability, scheduler timeliness or tenant isolation.
Those are release gates for an actual persistence adapter, not satisfied by passing
unit tests against a fake store.

## Executable offline contract update

See [delivery-milestone.md](delivery-milestone.md) for the exact extended interface
and release gaps. Frozen email now includes sender, Reply-To, immutable attachment
descriptor and canonical payload digest. `startSend` receives digest/time and must
enforce original first-send horizon, authority and token checks atomically. `finish`
returns a CAS boolean. Rate limiting is separately retryable; permanent rejection
and payload conflict block; in-flight conflict and uncertainty require reconciliation.
The 23-hour retry cutoff is always tied to persisted first-send time.
