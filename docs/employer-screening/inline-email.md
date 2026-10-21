# Optional review inside the original employer email

This is the simplified, default-OFF integration requested after the durable-delivery design. It changes no hiring outcome and does not require the separate delivery outbox, a scheduler, a receipt webhook, a new employer approval workflow, or a persistent second résumé copy.

## Single existing send

`notifyNewApplicant` still loads the existing forwarding details, prepares the original uploaded/builder PDF attachment, calls `sendEmail` once with `application/{applicationId}/employer`, then records its ordinary forwarding status. Optional review runs immediately before that same send using exactly the attachment bytes already in memory. It does not retrieve a second CV, change the recipient, create a second email, retry an uncertain send, or reroute delivery.

Only employer forwarding is scheduled through Next.js `after()` once the original chat work and applicant receipt have completed. The applicant response no longer waits for optional review or the employer send. A per-request started guard also prevents duplicate execution if scheduling throws after registering work; unsupported scheduling falls back to the original awaited notifier once. `maxDuration = 180` remains unchanged.

The review has one 25-second end-to-end limit, including the parser (at most three seconds), criteria read, budget authorization and one model request. Absolute time and abort checks reject late dispatch/output. Disabled gates, no CV, invalid PDF, unavailable criteria, exhausted allowance, provider failure or timeout preserve ordinary forwarding. Independently completed local presentation feedback can still be included when job match is unavailable. Missing evidence is unknown, never a failed criterion or a fabricated zero.

This is framework-managed post-response work, not a durable queue. Next.js `after()` shares the configured route lifetime; it does not survive process termination. A hard process crash or expiry before the original send cannot guarantee delivery; no new queue/watchdog is being claimed. Existing application uniqueness and email idempotency remain unchanged. There is no automatic replay after an uncertain send, and this patch does not provide a general email retry/recovery system.

## Published job criteria, not invented approval

The actual public job description is the source, including the same exact editorial presentation used by the public vacancy page. The mapper admits bounded whole professional requirement, duty and preferred clauses, preserving their wording, negation, alternatives, tenure and credential qualifiers. It does not infer requirements from the job title. Duties and preferred attributes are explicitly distinguished from mandatory qualifications. Contact/identity/protected-trait/instruction records are omitted whole, never edited into a misleading positive clause. Excluded protected requirements do not enter the score denominator.

The same single model request compares admitted job clauses with already-minimized résumé evidence. The model returns only criterion IDs, supported/unknown findings and supplied evidence IDs. Code rejects missing/invented IDs and explicitly disqualifying résumé qualifiers, and computes equal integer weights itself. Semantic correctness is model judgment, not something exact citation presence proves. A general skill/task statement does not establish years, personality, proficiency, credential validity or legal eligibility. Uncertain support is unknown.

Admission is bounded and heuristic, not a general PII redactor or a guarantee of understanding every job. The mapper retains local description SHA-256, exact source locations, clause hashes, source kind and version. The provider receives only admitted clauses and required/preferred/duty distinctions, positional IDs and a generic omission marker, not the full description, job/employer identity, source hashes or locations. The report calls these **published job criteria, equal weights**, with a partial-scope caption when context was omitted, not complete vacancy eligibility or employer-approved weights. Bounds cannot silently truncate a partly understood vacancy into a full score; unavailable mapping leaves independently valid local presentation feedback available. Honest coverage and privacy limitations require launch review. Approved saved rubrics in the disabled older path retain their unchanged strict catalog contract.

## Existing evidence and quality boundary

The reviewed bounded PDF worker, professional-context minimization, exact evidence citations, provider output validation, deterministic point aggregation and compact email rendering are reused. No raw PDF/page fallback is sent to OpenAI. Data that passes the reviewed boundary is minimized job-related evidence and professional context; filtering reduces risk but is not a universal anonymization guarantee. The applicant notice remains explicit about OpenAI processing and employer-only advisory results. The employer summary does not claim human review.

Local presentation checks are separate from job relevance and retain the fixed full-rubric /10 denominator with a partial-assessment caption where appropriate. They are limited text-organization and evidence-presentation checks, not a comprehensive writing/design judgment or candidate merit rating. Grammar, identity, protected traits and career gaps are not graded.

## Budget without a delivery queue

The companion unapplied SQL adds a small private inline-attempt marker and service-only begin/settle functions. It uses the same application-unique budget reservation authority, fixed global UTC-calendar-month US$5 ledger, configuration-specific daily ledger and historical reservations as the existing implementation. It does not create an outbox record or another monthly spending pool.

A single transaction verifies ownership, legacy delivery path, active configuration and available allowance, reserves the full conservative input-context/output bound, and consumes the attempt before returning dispatch authorization. The returned cutoff is bounded by the request deadline and UTC day boundary. There is no reserve/start rollover gap. An attempted/unknown/crashed call retains the full reservation. Only validated usage may settle/refund the difference in its original ledger period. This deliberately sacrifices some allowance after an uncertain result rather than risk exceeding the cap; no sweeper or automatic rearming is needed.

The reviewed configuration pins `gpt-6-luna`, the full 1,050,000-input-token ceiling, 1,024 maximum output/reasoning tokens, low reasoning, default service tier and explicit caching with no breakpoints. At 220,000 input and 825,000 output micro-USD per million tokens, the worst-case reserved cost is 231,845 micro-USD per attempt. Actual charges can be much lower. The US$5 cap applies to this application's shared API authorization ledger, not unrelated account traffic, email/hosting costs or taxes.

## Activation and rollback

All defaults remain OFF. Inline activation requires:

- Exact reviewed additive inline SQL on the confirmed target, validated service-only privileges and shared-ledger tests. Do not apply the superseded canary/sweep migrations as prerequisites.
- Current notice displayed and forwarded from the actual application request; privacy and contextual-data-sharing readiness confirmed.
- `EMPLOYER_SCREENING_INLINE_ENABLED`, privacy/context/notice gates and the public notice gate deliberately enabled. Paid calls additionally require budget approval, paid-provider enablement, the pinned config ID, existing server key and an enabled reviewed config.
- The old `EMPLOYER_SCREENING_ENABLED`/outbox worker/cleanup/canary gates remain OFF. No new scheduler or receipt-webhook dependency is introduced.
- A separately approved fictional test on the deployed exact commit before ordinary applicant processing. No live test was run by this source-only patch.

Disable the inline gate to immediately stop new enrichment without changing the original email path. Keep budget/attempt history intact. Do not automatically remove the separately installed schema, private storage or webhook: their rollback/security/data effects require their own explicit approval. In particular, the already-installed OFF-path baseline trigger can continue storing private delivery records even while inline screening is disabled; this patch does not alter that existing side effect or add age-based retention.

Framework contract: [Next.js after reference](https://nextjs.org/docs/app/api-reference/functions/after), checked 2026-10-21. Hosted post-response execution still needs an acceptance test on the deployed commit.
