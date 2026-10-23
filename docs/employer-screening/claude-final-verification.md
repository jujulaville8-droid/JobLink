# Claude v4 follow-up verification

Completed 2026-10-21, source-only. This supersedes the historical v3 copy/verification
for the bounded follow-up described in [claude-review-adjudication.md](claude-review-adjudication.md).
All runtime gates remain OFF. SQL and the new inert cron draft remain unapplied.
No paid call, real applicant processing, external email, live settings or publication occurred.

## Exact base and changes

Full recovery patch targets verified main `ff24fac00fb2c62f15c6d2e75f330ac1d563c82e`,
last rechecked read-only at 14:35 UTC. Six reconciled main files are unchanged and
excluded. The small delta applies ONLY to frozen v3 full-patch hash
`6c611c2a2f0c1063f66f18d053f03f4924e6c034604f9ebfac102e3cfdf7d7e4`.
Original/v3 bundles remain preserved. Manifests bind every source file and exact
patch hash; package verification applies both routes and compares all resulting files.

Runtime follow-up is limited to ordinary owner-scoped uploaded-PDF chat parity
and the latest requested concise presentation score out of 10. Provider, privacy,
PDF parser, SQL, internal quality/storage and production deadlines are unchanged.
Test-only fixture timing changes and exact new-copy assertions are included.
Scheduler documentation and an inert proposal do not enable scheduling or remove
the activation blocker.

## Post-last-edit commands

- `npm run typecheck`: passed.
- `npm run lint`: passed, six pre-existing warnings and no errors.
- `npm run test:unit`: **2096 passed**, one existing opt-in live-email test skipped.
  This is a fresh complete standard run, without a global timeout override.
- `npm run test:node`: **111 passed**, including durable outbox/capture PGlite tests.
- `npm run test:outbox:concurrency`: **11 explicitly skipped** without a disposable
  local PostgreSQL server. This is not proof of multi-session concurrency.
- Standard `npm run build` with non-secret placeholder Supabase values: passed.
- Post-build isolated builder smoke using only deployment-traced files: passed.
  All three PDF.js runtime assets are present in the apply route trace.
- Actual synthetic PDF-to-email preview: passed. It made zero provider/email calls.
- Before/after final recheck code/config/test/SQL fingerprint: `9b6cdd6e5a0b4f4bc36b32e02e5750a99e9162c75df775346ec54c89553724bb`
  (713 files), identical. Package construction verifies the same fingerprint.
  Documentation completion is excluded from this execution fingerprint but included
  in the complete final source manifest.

## Failures and limitations not hidden

The initial v4 full-suite run caught two E2E expectations for the old presentation
copy; they were updated to the new exact not-assessed wording, absence of a /10
score when unavailable, and the full-score wording when fully observed. The complete
unit suite, typecheck and lint were rerun afterward. Node/build/trace had already
completed after the final test-only edit, with unchanged runtime source, so their
exact evidence was retained rather than duplicated. The post-build fingerprint
matches the final frozen source. First-run logs are retained outside the frozen
v3 bundle. Earlier Claude/v3 admin and capture timing failures are addressed by narrow
test-only changes, not relaxed production bounds. A diagnostic renderer warm-up
failure was also removed from the CPU-abort test by warming only the relevant module;
actual renderer output and trace smoke remain covered separately.

The fictional compact preview is `compact-employer-preview.html`, SHA-256
`bc0935891afdcd1c113b1fcc3f3b21d1ecf17ceaa66961c2276dc7a8e2cb403e`. It displays 6.25/10 supported
presentation credit with explicit partial assessment, separate from 70/100 job
match and 30 unresolved. Those job findings are explicit offline fixture inputs,
not another real model result. Unknown presentation is not normalized to 10 or
silently called poor; all-unknown stays not assessed. The old authorized real
70/30 Luna demonstration remains preserved and tests only the older skill request.

Independent narrow review found no new blocker in the restored chat boundary or
fixed-rubric score display. Retained legacy full-URL seeker-download compatibility
is documented rather than claimed fixed. Finite local presentation/professional
coverage, no live expanded-context semantic/injection evaluation, no hosted runtime
verification and no real PostgreSQL concurrency verification remain explicit.

## Activation is still blocked

Source-review readiness is not operational readiness. In particular, scheduler
plan entitlement is unverified after a denied read; no minute job is registered.
Baseline recovery becomes eligible at +120 seconds, and jitter/backlog can delay
attempts. An exact two-minute attempt guarantee is not established. The timing
requirement/recovery SLO, plan and costs must be explicitly resolved before activation.
See [scheduler-activation.md](scheduler-activation.md).

Other prerequisites remain: exact external re-review and fixes/retests, separate
publication approval, database/hosting/storage and rollback tests, approved retention
and applicant processing notice, expanded provider data-sharing approval, verified
sender/receipts, owned approved job rubrics, approved exact provider/rates/budget and
controlled runtime gate rollout. No activation is inferred from source publication.
