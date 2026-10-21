> Historical milestone, superseded by [README.md](README.md) and [final-verification.md](final-verification.md). Statements below describe the earlier prototype, not the current integration.

# Offline mocked API boundary

`src/lib/employer-screening/api-boundary.ts` provides `createMockProcessor(provider, limits)`, compatible with the existing `screen()` wrapper. It is disconnected from application routes and has no network implementation, SDK, credential access, retry, fallback, logging, database writes, or deployment behavior. Only synthetic fixtures are authorized at this stage. No provider, model, or monetary cap is selected.

The injected `MockProvider` receives a serialized task and only:

- Job title only, plus the existing synthetic application snapshot timestamp as `asOfUnixMs` (no new wall-clock value).
- Rubric criterion ID, label, and category.
- Evidence ID, category, and excerpt.

Application/company/job IDs, other dates, résumé version/hash/location, rubric weights, recipient details, and forwarding metadata are omitted. This is field minimization, not free-text anonymization. Titles, excerpts and labels could still contain personal information or protected traits; future live ingestion requires an explicit approved extraction/minimization and privacy gate. Evidence pre-categorization remains a future extraction-design gate, not a reason to relax the current validator. `verificationRequired` remains human follow-up, not a claim of AI verification. Temporal criteria must have explicit approved date semantics in labels/evidence and use the supplied as-of timestamp rather than the processing date.

The boundary bounds input UTF-8 bytes before dispatch; validates the mock input-token counter; reserves output-token headroom against a per-call total-token limit; races completion against timeout/caller cancellation; rejects oversized output and invalid/mismatched reported usage; parses only a strict object-root JSON envelope `{ "assessments": [...] }` (root arrays and extra root fields are rejected), unwraps it; and delegates strict assessment/evidence-ID validation to the existing deterministic scorer. It returns assessment data only after validation. `screen()` maps errors to `{ status: 'unavailable' }`, distinct from a valid all-unknown assessment. Output validation disallows invented evidence, unsupported fields, numeric scores, and prose instructions. It cannot prove semantic truth or defeat every prompt injection that produces schema-valid findings. Evidence-linked output still needs human review.

## Limits of this mock

- The injected code is trusted test code. The `mode: 'mock'` marker is not a security sandbox.
- Input token accounting and reported usage follow a synthetic contract, not a selected model's tokenizer or trusted provider billing. Exact `inputTokens === countInputTokens(promptJson)` is explicitly a MOCK-only contract; do not carry it unchanged into a real provider adapter, whose usage can include different serialization/token overhead.
- Output byte checks happen after the injected transport returns. A future network transport must enforce streaming/response-body caps before accumulating an oversized response.
- Abort signals and timers cannot interrupt synchronous blocking JavaScript or reclaim a remote request already accepted. Late results are discarded; cancellation is not proof that billing stopped.
- Numeric token limits are not a monetary spend cap. Any future paid integration requires an approved provider/model/pricing and a durable, atomic allowance reservation before dispatch, with idempotency and reconciliation of uncertain usage. Budget denial or budget-adapter failure must block dispatch. No allowance adapter is implemented or implied here.
- No live applicant data, real API calls, credentials, writes to application data, or deployment/push are part of these tests.

Validation: `npx vitest run tests/employer-screening-api-boundary.spec.tsx`, `npx eslint src/lib/employer-screening/api-boundary.ts tests/employer-screening-api-boundary.spec.tsx`, and `npm run typecheck`.
