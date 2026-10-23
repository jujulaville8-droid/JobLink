> Historical milestone, superseded by [README.md](README.md) and [final-verification.md](final-verification.md). Statements below describe the earlier prototype, not the current integration.

# Offline durable outbox draft

Status: **not applied, not wired, not production-ready**. The SQL is intentionally
under `docs/employer-screening/drafts/employer-outbox.unapplied.sql`, outside the
migration runner. The required Supabase CLI is not installed; no CLI installation,
live database, remote documentation fetch, provider API, environment change,
credential, deployment, scheduler, or external storage access was performed.
Current Supabase documentation/advisor verification remains a release gate.

## Implemented boundary

`src/lib/employer-screening/supabase-outbox-store.ts` implements the existing
`OutboxStore` with an injected server-only RPC client, without constructing a
Supabase client or loading secrets. It checks returned snapshot identities and
integrity and frozen email integrity. Clock arguments are deliberately ignored:
PostgreSQL's clock controls leases, due times, attempts and the original retry
horizon. SQL errors surface as a generic persistence failure, never a direct send.

The proposed AFTER INSERT trigger creates exactly one outbox row in the application
transaction. Company, employer account, job and applicant identities are derived
from existing joins; there is no enqueue endpoint accepting a tenant or recipient.
An outbox insertion failure rolls back the application. A successful insertion is
always **inactive**, with no screening snapshot or attachment. Existing applications
are not backfilled. No function activates or provisions those rows.

Synthetic tests alone provision trusted materials with the database test owner.
The private table denies direct access to service_role as well as anon and
authenticated. Only four public, explicitly service-role-only SECURITY DEFINER
RPCs are exposed, with empty search_path and qualified relation references.
The trigger and helper functions are private with PUBLIC execution revoked.

Claim uses a UUID fencing token and a three-minute lease with SKIP LOCKED. Freeze,
start and finish check row state, token and live expiry while holding row locks.
The first canonical email text/digest cannot be replaced through any RPC. Freeze
checks the application's snapshot identities, résumé version/hash, trusted sender,
recipient, Reply-To and trusted descriptor. Descriptor paths are additionally scoped
to applicant/application IDs. Paths are descriptors only, not storage proof.

Start persists first-send time and increments attempts before returning permission
to send. Claims and start enforce four total attempts and a strict original
23-hour window. Known-unsent/rate-limited outcomes require a future retry timestamp
strictly inside that window. Uncertain/concurrent-conflict outcomes quarantine;
permanent/payload rejection blocks. Expired sending is quarantined by claim, never
reclaimed. Accepted, uncertain, blocked and inactive rows are never claimed.

Routing uses a conservative mailbox parser mirroring existing contact rules,
including placeholder rejection. A changed owner, routing address, applicant
Reply-To, or banned user blocks, rather than inventing a fallback. The sender is
pinned to `notifications@joblinkantigua.com`, matching the mailbox in the existing
sender (without its display name, which the frozen core does not support).

## Unresolved compatibility and production gates

The existing schema has no approved application-time rubric or immutable private
résumé capture. The frozen core also requires `Snapshot` for every QueueItem and
exactly one attachment in every FrozenEmail. That does not support baseline
forwarding for missing/corrupt/no-approved-rubric snapshots or unavailable résumés.
This draft does not weaken the core or synthesize a rubric to hide that mismatch.

A separately reviewed core change must introduce an independently validated,
typed baseline forwarding envelope, with screening snapshot optional and distinct.
It must allow unscored forwarding without an approved rubric. Trusted material
capture must be atomic with application acceptance, with immutable storage/version
and tenant ownership proofs; no mutable profile URL may substitute. No production
material-provisioning or activation API is included here.

Before activation: approve that core/envelope path, validate private immutable
storage capture and retention, implement recipient-policy review, explicit receipt
reconciliation and operational watchdog scheduling, test real PostgreSQL
multi-session concurrency/isolation and hosted role configuration, review SQL
advisors/current documentation, and generate a proper migration with the CLI.
The current claim-time sweep is not an independently scheduled watchdog.

Cutover must select exactly one delivery path atomically at application acceptance.
First stop the legacy direct employer sender for the selected cohort, then enable
an approved application transaction that creates fully trusted pending rows.
Never activate dormant historical rows merely by changing their state: the old
route may already have sent them. Reconcile any uncertain application commit by
its unique application identity, never by sending through the old route. Rolling
back must not reactivate legacy delivery for already queued or uncertain rows.
No cutover, feature flag, apply route or scheduler change is part of this draft.

Fencing protects database writes, not external exactly-once email delivery.
Provider idempotency, verified retention/error mapping, and evidence-based manual
reconciliation are separate requirements. No reconciliation RPC is provided.

## Verification

Run from the repository root:

    node --import tsx --test tests/employer-outbox-store.test.mjs

Eighteen synthetic PGlite integration tests pass: atomic capture/rollback, inactive
default, public-role denial, service-role RPC-only access, due claims, fencing and
expiry, immutable freeze/digest/identity checks, persisted first-send time, bounded
retry, routing/owner/ban revalidation, and expired sending quarantine. Concurrent
Promise calls verify no duplicate lease in PGlite's serialized engine; they do NOT
prove true independent PostgreSQL-session races or lock-wait behavior. These tests
use no real applicants, bytes, accounts, credentials or network endpoints.

TypeScript no-emit and focused ESLint checks also pass. The conventional tsx CLI
could not open its local IPC pipe in the sandbox; Node's supported `--import tsx`
runner executes the same local tests without that optional IPC listener.

## Existing deletion semantics

All outbox foreign keys use ON DELETE CASCADE, preserving the existing application's
job/company/seeker/account deletion behavior. This draft does not introduce a new
retention restriction or block an otherwise authorized deletion. Deleting an
application or its parent removes its dependent private outbox record. Claimed
workers then fail freeze/start/finish CAS, and claim cannot recreate the row.
A deletion after external sending has begun cannot undo an already dispatched
email; that is not an exactly-once or recall guarantee. Deletion and cleanup of
future private immutable blobs require a separate approved design and are not
implemented by these database cascades.

Two additional regression tests cover application, job, company, applicant-auth
and employer-auth cascade paths, plus stale claimed/sending workers after deletion.
The focused database suite now contains 18 tests.

Additional activation blockers: claim currently returns null after quarantining
one row with missing material or invalid authority, even if another due row exists.
A worker must not interpret that response as proof that the queue is drained.
A separately reviewed bounded-skip/result contract is needed before scheduling.
The expired-send/retry-limit sweeps execute UPDATE before SKIP LOCKED selection;
they can wait on another transaction's row lock. PGlite does not test independent
lock contention, and the current draft makes no non-blocking claim guarantee.
Deletion during an in-flight provider call additionally requires an explicit
cancellation/reconciliation and audit policy before any production activation.
