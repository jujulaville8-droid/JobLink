# Employer screening scheduler activation gate

Status: **INERT PROPOSAL, NOT REGISTERED OR ACTIVATED BY THIS WORK**. Reviewed
2026-10-21. This document and the adjacent unapplied JSON are source-only. They do
not authorize a deployment, schedule, plan change, secret, database migration,
real applicant processing, paid model call, or email. Existing `vercel.json` is
unchanged. Live scheduler registration and plan entitlement remain unverified.

## Decision and blockers

Use the existing authenticated `GET /api/cron/employer-screening` endpoint for
periodic recovery, retries, expired-send quarantine, and eligible capture cleanup.
The proposed cadence is `* * * * *` (every minute, UTC), **only after the approval
checklist below**. Do not create another service, queue, scheduler, or paid resource.

There are two separate blockers:

1. **Entitlement is not verified.** A read-only repository-filtered Vercel project
   lookup matched `jujulaville8-droid/JobLink` to project `job-link`. Reading its
   owning team returned HTTP 403, missing access to scope
   `jujulaville8-droids-projects`, on 2026-10-21. The read stopped there; no alternate
   credentials, access grant, or settings change was attempted. An authorized
   operator must verify the actual owning team's plan and effective project limits.
   Existing hourly entries in `vercel.json` are not proof of a paid plan, successful
   deployment, enabled cron jobs, or permission to incur costs.
2. **A first forwarding attempt within exactly two minutes is not established.**
   The current recovery path becomes eligible at that deadline, not before it.
   Minute scheduling, variable dispatch time, serial work, and backlog add delay.
   If an exact two-minute attempt bound is a release requirement, activation stays
   blocked pending an explicitly approved requirement/design decision and evidence.
   Registering this draft alone does not resolve that requirement.

Current official Vercel limits allow minute cron schedules on Pro/Enterprise;
Hobby permits daily schedules only. Cron invocations consume function resources,
so inclusion of the cron feature does not establish zero incremental cost. Confirm
the plan, quota and acceptable cost before activation; do not upgrade or start a
trial to make the proposal work. [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## What the existing source actually does

Source of truth: [`worker.ts`](../../src/lib/employer-screening/worker.ts),
[`index.ts`](../../src/lib/employer-screening/index.ts),
[`application.ts`](../../src/lib/employer-screening/application.ts),
[`cron route`](../../src/app/api/cron/employer-screening/route.ts),
[`apply route`](../../src/app/api/jobs/apply/route.ts), and the
[`unapplied outbox SQL`](drafts/employer-outbox.unapplied.sql). SQL behavior here is
the reviewed source contract, not evidence that a live database has it installed.

| Boundary | Current behavior | Operational consequence |
| --- | --- | --- |
| Request fast path | The apply route schedules `after()` for an accepted screening-path application when the worker flag is on. It calls the shared drain, not a dedicated per-application job. | Helpful latency optimization; no independent execution after request/process failure and no guaranteed retry wake-up. Other queued work can run first. |
| Baseline release | Database acceptance sets `processing_deadline` and initial `next_attempt_at` to `applied_at + 2 minutes`. Material finalization makes the row due immediately. | If finalization fails or the request dies, the baseline becomes claimable at +120 seconds. A timestamp cannot wake a worker. |
| Optional scoring | `processNext` caps scoring at 60 seconds per item and application creation +95 seconds. The drain also reserves 25 seconds from its remaining nominal budget. SQL rejects new model authorization at deadline minus 25 seconds. | Late work must use the baseline/unavailable report, not wait for scoring or send a later score email. This is not an end-to-end delivery bound. |
| Delivery drain | Watchdog runs first, then up to 10 serial iterations with a default 90-second budget. Helper options are clamped to 20 items/120 seconds; the production caller uses the defaults. Time is checked between items. | Ten is a cap, not guaranteed throughput. An awaited RPC or in-flight item can outlast the loop budget. `processed` counts successful state transitions, not accepted emails. |
| Transport | Default timeout is 20 seconds, followed by up to 25 milliseconds for cancellation classification. Attachment preparation occurs inside this timeout, after the database send-start transition. | Persisted attempt time is not proof an HTTP request reached Resend. Uncertain dispatch is quarantined, not automatically repeated. |
| Function lifetime | Both routes declare `maxDuration = 180`. | Verify the effective deployed duration and runtime; the declaration does not prove hosting support. Watchdog/RPC/storage awaits and cleanup are not all covered by the drain's 90-second check. |
| Leases | Claim expiry is the earlier of claim+90 seconds and the later of deadline−20 seconds or claim+10 seconds. Send-start extends its lease to 60 seconds. | Late claims can have only 10 seconds to freeze/start. Expired pre-send leases can be reclaimed; expired sending is uncertain. Database latency matters. |
| Watchdog | Each delivery-enabled invocation quarantines at most 100 expired sending rows before the drain. Claim also handles expired rows while selecting due work. | Quarantine needs a future successful invocation. It neither proves non-delivery nor grants permission to resend. |
| Retry | Only provably unsent or documented rate-limit rejection is eligible; ordinary backoff is 30/60/120 seconds, or the provider delay with a 30-second floor. At most four send starts fit strictly inside the original first-send+23-hour horizon. | Due time is the earliest retry time, not a scheduled execution. A late invocation may block rather than retry beyond the horizon. More frequent cron does not authorize more attempts. |
| Capture cleanup | After delivery, up to 10 exact-path cleanup claims run. Orphans are due after one hour; deleted in-flight/uncertain captures wait until at least first-send+24 hours. Live outbox references exclude removal. Cleanup leases last three minutes; unsuccessful completion defers 15 minutes. | Cleanup eligibility is not a deletion SLA. A slow/failed delivery phase can delay or prevent cleanup that invocation. Cleanup failures do not always increment the HTTP summary's `failed` count. |

The function limit terminates overlong execution rather than guaranteeing that
all phases finish. Verify the deployed runtime and timeout independently of cron
entitlement. [Vercel maximum duration](https://vercel.com/docs/functions/configuring-functions/duration)

### Independent default-OFF gates

- Delivery and its watchdog require `EMPLOYER_OUTBOX_WORKER_ENABLED=true`,
  `EMPLOYER_SCREENING_SCHEMA_READY=true`,
  `EMPLOYER_SCREENING_DELIVERY_APPROVED=true`, and a configured `RESEND_API_KEY`.
- Cleanup independently requires `EMPLOYER_SCREENING_CAPTURE_CLEANUP_ENABLED=true`
  and `EMPLOYER_SCREENING_SCHEMA_READY=true`. It checks that the capture bucket is
  private. It can run without email credentials, but cleanup-only mode does not run
  the delivery watchdog.
- If neither branch is enabled, the authenticated route returns `disabled: true`
  without constructing a service client. HTTP 200 alone does not prove a working
  drain, empty queue, or cleanup success.
- Model dispatch additionally requires the screening, both privacy-approval,
  budget-approval and paid-provider flags, a valid immutable budget configuration,
  the model credential and successful SQL budget/lease authorization. Scheduler
  approval is not model-spend or private-data-processing approval.
- New application cutover has separate application gates, including
  `EMPLOYER_SCREENING_WORKER_READY`, and the database configuration. Do not set
  worker readiness merely because the endpoint exists or a cron entry was added.
  Keep new application selection OFF until all release gates are met.

## Schedule, authentication, and realistic timing

[`drafts/employer-screening-cron.unapplied.json`](drafts/employer-screening-cron.unapplied.json)
contains only the proposed cron fragment. It is outside deployment configuration
and is not read by the application. After approval, merge its one entry into the
existing `crons` array; **do not replace `vercel.json` or remove its other jobs/git
settings**. One schedule runs all enabled phases through the existing worker.

Vercel invokes cron paths with GET against the production deployment. The proposed
five-field expression uses UTC, without a seconds field. A preview or local test
does not demonstrate production scheduling.
[Vercel cron overview](https://vercel.com/docs/cron-jobs)

The existing route requires `Authorization: Bearer <CRON_SECRET>`, rejects missing
configuration/mismatched headers with 401, and uses a length check and constant-time
comparison. Reuse that contract; never put the secret in the URL, JSON draft, logs,
or a public test. Verify that a production secret is configured through the approved
secret-management flow without retrieving or exposing its value.

Vercel sends the configured `CRON_SECRET` in the authorization header. Delivery is
best effort: runs can be missed or duplicated, failures are not retried by the
scheduler, long runs can overlap, and redirects are not followed. Paid-plan timing
is within the scheduled minute, not necessarily at its first second. Use existing
database fencing/idempotency, and verify their concurrent behavior rather than
adding an unrelated lock service. [Vercel cron management and security](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

**Timing conclusion, derived from the source and platform behavior:**

- Let `D` be database acceptance +120 seconds. If request finalization never
  completes, no cron can claim that row before `D` under the current SQL.
- Even an ideal exactly-on-the-minute scheduler can first see the due row almost
  60 seconds after `D`. With invocations occurring anywhere within their scheduled
  minute, the gap between adjacent successful invocations can approach 120 seconds.
  Thus a low-backlog recovery claim can approach four minutes after acceptance
  before database/attachment/send work, even without a missed scheduled minute.
  These are illustrative delay calculations, not platform SLAs.
- Queue delay, serial earlier items, a lost invocation, cold start, database
  latency, rate limiting or a function termination can increase that time further.
  There is no finite unconditional forwarding-attempt bound in this design.
- The defensible statement is: optional scoring has a bounded cutoff; the baseline
  remains durably eligible for a later authorized worker invocation; approved
  periodic recovery reduces dependence on the request's `after()` callback.
  Liveness still depends on successful scheduling, available dependencies, valid
  authority, and sustainable backlog. Neither an attempted send nor provider
  acceptance guarantees inbox delivery.

Do not advertise “delivered within two minutes,” “attempted within two minutes,”
or “at most three minutes with minute cron.” An exact attempt requirement needs
an approved implementation/design decision; a recovery SLO needs an explicitly
accepted non-guaranteed target, measured load envelope, and alert thresholds.

## Deployment approval and evidence checklist

Everything below remains pending unless recorded for the exact release revision.

1. **Resolve the timing requirement.** Record whether the release requires an
   exact attempt bound or accepts an operational recovery SLO. Do not silently
   weaken an existing requirement. Record expected peak arrival rate, backlog
   capacity, maximum tolerated due age, and who handles an alert.
2. **Verify target and entitlement read-only.** Confirm repository linkage,
   production project/team, active plan, minute-cron eligibility, remaining cron
   quota, and effective function/runtime limits. Resolve the denied team read
   through the authorized owner or a user-approved access change. No plan upgrade,
   new access grant or payment is part of this document.
3. **Approve resource cost and separate release prerequisites.** Minute cadence
   means nominally 1,440 scheduled invocations/day (43,200 per 30 days), plus request
   fast-path and possible duplicate invocations. Review function/database/storage
   load even when the queue is empty. Separately approve SQL migration/storage,
   data handling/retention, delivery, notice, model budget, and credentials under
   the [main activation checklist](README.md#unapplied-sql-and-activation-checklist).
4. **Verify safety before cutover.** Use synthetic fixtures and stub transports.
   Check missing/wrong cron authentication, disabled no-client behavior, delivery
   versus cleanup gates, no-finalization recovery, frozen retries, lost `after()`,
   missed/duplicate/overlapping ticks, lease expiry, more than one batch of due
   work, database delay, and recovery after function termination. Demonstrate real
   PostgreSQL multi-session fencing, including receipt/send and cleanup/apply
   races; skipped tests or PGlite are not that evidence. Do not test this against
   real applicant queues or invoke a live enabled route without authorization.
5. **Record measured capacity and observability.** Measure acceptance-to-send-start,
   due-to-claim lag, actual provider dispatch/acceptance, oldest pending age, due
   row count, retry horizon margin, expired sending/uncertain count, cleanup due
   age and failures, invocation duration, and successful-run gaps. Distinguish
   missing runs from zero-work runs. Current HTTP counters omit cleanup totals,
   queue age and some failure detail; do not call monitoring complete based on
   200/`processed` alone. An approved way to observe these gaps is a release gate,
   not permission to install a new monitoring service.
6. **Authorize the exact additive schedule and deployment.** Record the approved
   revision, environment and recovery/cost policy. Only then add the one fragment
   to actual configuration and deploy. Keep application cutover/model dispatch OFF
   while verifying registration and enabled state in the owning project's Cron
   Jobs settings. Verify the direct endpoint is not redirected, cached, intercepted
   by middleware or blocked by deployment protection; do not weaken protections.
7. **Prove operation before readiness.** An approved disabled-mode production
   invocation can establish scheduling/authentication without sending or cleanup;
   it cannot prove enabled processing. Obtain separate authorization for any
   enabled canary, with synthetic data and controlled recipients. Observe multiple
   scheduled runs and the tested failure/recovery cases, then explicitly approve
   readiness and staged application selection. Continue observing the agreed
   recovery SLO and capacity, not just deployment success.
8. **Rehearse rollback.** Stop selecting new screening applications without
   switching already-selected rows to legacy delivery. Preserve approved drain,
   receipts and cleanup for existing work. An emergency pause of sends does not
   clear uncertainty, prove non-delivery or permit replay. Recheck the effective
   cron definition and project enablement after rollback; do not disable all
   project cron jobs and inadvertently stop unrelated existing jobs.

## Scope and verification of this document

Only this document and the unapplied JSON fragment were added for the scheduler
review. No live cron registration, route invocation, migration, applicant-data read, email,
paid provider request, secret setup, deployment or plan/access change was performed.
The read-only target lookup succeeded; the team/plan read was denied, so entitlement
is explicitly unresolved. Public Vercel sources above were checked on 2026-10-21;
recheck them and the actual project at activation time.
