# Final Claude review adjudication

Source-only follow-up to review `01M5FJH5QNK2G0C4A4RC8XBVE5`, 2026-10-21.
The frozen v3 full patch is SHA-256
`6c611c2a2f0c1063f66f18d053f03f4924e6c034604f9ebfac102e3cfdf7d7e4`.
The v3 bundle and original quality/cache bundles remain unchanged. The new delta
applies only over that exact v3 source, not over an older foundation/cache patch.

## M1 / L2: Scheduler registration and cleanup

Confirmed operational prerequisite, not silently activated. `after()` is a fast
path, not a durable wake-up mechanism. The endpoint already runs delivery,
watchdog, retries and independently gated exact-path capture cleanup. The new
[scheduler activation checklist](scheduler-activation.md) and inert
[cron fragment](drafts/employer-screening-cron.unapplied.json) document the proposed
minute cadence, authentication, independent cleanup gate, cost/entitlement check,
load tests, monitoring and rollback. `vercel.json` is unchanged.

The owning-team entitlement lookup was denied with HTTP 403; no access expansion
or alternate credentials were attempted. Existing hourly entries are not plan
proof. Minute scheduling is not approved or registered, and no paid plan is
assumed. Recovery eligibility starts at application acceptance +120 seconds;
cron jitter, backlog and dependencies can delay the attempt. An exact two-minute
attempt guarantee is not established. Activation stays blocked until the timing
requirement/recovery SLO and infrastructure/plan costs are explicitly approved and
verified. This source-only response does not declare M1 operationally resolved.

## M2: Returned model identity

Not reproduced by the saved, authorized fictional response. Its root `model` is
exactly `gpt-6-luna`; file SHA-256 is
`26681e55853e7e9aaab9f9c575f005e2e2f6aa9982c5766d3e4b6eb12147bc07`.
No new provider request was made. The existing exact model validation remains.
A future dated snapshot requires independently verified identity, context/rates
and approved configuration before adding that exact identity. A permissive prefix
regex could accept an unpriced model and is not introduced.

That historical response validates only the earlier fictional skills request,
not the expanded professional context, document-presentation rules, or real-data
privacy/model accuracy. Its reported billing payer is not evidence of a user debit.

## M3: Reservation size

Conservative reservation retained deliberately. The adapter bounds the complete
serialized request body at 32,000 UTF-8 bytes by default, including the supplied
schema. That is an input-size guard, not a proven upper bound on total billable
input tokens including model-specific framing/internal overhead. No certified
hard bound or applicable tokenizer contract was established, so replacing the
verified full context ceiling with the byte count would weaken the spending
invariant.

The immutable approved configuration still reserves the full verified context
ceiling plus the output cap and configured premium before dispatch. For the
historical approved rates, 1,050,000 input tokens at $0.20/M plus 1,024 output
tokens at $0.75/M, with a 10% premium, is $0.2318448. This is illustrative prior
probe arithmetic, not a seeded operating budget or a new spending authorization.
Verified bounded usage may settle lower; uncertain/missing usage retains the
reservation. Explicit-only cache/no breakpoints, low reasoning, default tier,
1,024 output cap and no retry/fallback remain unchanged. Tighter reserves need a
separately verified total-token bound and tests, not an assumed bytes/token ratio.

## L1: Existing chat attachment parity

The apply route once again reads the authenticated seeker's ordinary uploaded CV
for the initial participant-authorized conversation message on both paths. On the
new screening path, the existing `applicantCvPath` validator restricts this to the
applicant-owned PDF in the ordinary `cvs` bucket. Foreign owners/hosts, traversal,
private capture paths and missing files are not linked. The default-OFF legacy
attachment behavior is unchanged. Builder-only CVs still have no ordinary upload
link; this does not create a new private-capture download endpoint.

The chat link remains the ordinary uploaded-file reference, not a claim that it
is the frozen scored copy. Retained legacy-format limitation: if an old profile
stores a full same-origin storage URL instead of the current raw storage path,
the helper normalizes it for the employer message, but the existing seeker's own
download authorization compares the profile value literally. That applicant can
still receive 403 for the normalized link; ordinary current raw-path uploads and
employer participant access are covered here. This bounded fix does not expand
the unrelated download endpoint's authorization. Mutable profile data never replaces the independently
captured original email bytes/evidence, and no second employer notification is
sent. Regression cases verify both delivery paths, absent/unsafe chat paths and
no legacy employer send on the screening path.

## Test-only timing corrections

- The existing 25,001-row admin fixture gets its own 15-second test timeout rather
  than the default 5 seconds. Its queries/assertions and production behavior are
  unchanged; the isolated fixture completed in 5.46 seconds during diagnosis.
- The builder provenance fixture prepares a real synthetic PDF before the timed
  capture phase and injects those exact bytes via the existing dependency seam.
  It retains real extraction, metadata, render-input and SHA-256 assertions.
- A CPU-loop cancellation regression now warms only the document-module import,
  not an unrelated extra real layout. It still starts/terminates an actual busy
  worker under the unchanged 100 ms test deadline and asserts timer responsiveness.
  Real renderer coverage remains in its dedicated test and deployment-trace smoke.

No production capture/parser/render deadline, global test timeout, provider
configuration or safety assertion was raised or removed. Final command outcomes
and exact source hashes accompany the new review bundle. Real PostgreSQL and
hosted-runtime checks remain activation prerequisites, not claimed local passes.

## Latest user presentation-score clarification

The user clarified after v3 that the compact employer email still needs a résumé
presentation score out of 10. The renderer restores only this concise separate
score next to the grounded critique. It uses supported points divided by 10 from
the fixed 100-point rubric, not supported/observable normalization. Partial
assessment remains explicitly labeled, and all-unknown/unavailable remains not
assessed rather than zero. The detailed assessed-points breakdown remains hidden.
Presentation, Highlights, To verify and Job match order, no AI/human-reviewed
claim, the neutral footer and explicit applicant AI-processing notice are unchanged.
Internal quality/scoring/storage and all processing gates are unchanged.
