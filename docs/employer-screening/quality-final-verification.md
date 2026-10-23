# Historical v3: Superseding quality/context/compact-email verification

This records the preserved v3 freeze, not the latest source. The later user score clarification and Claude review fixes supersede its email copy; see [claude-final-verification.md](claude-final-verification.md) for the current exact checks.

Completed 2026-10-21 15:33 UTC. Source-only implementation is frozen for the requested independent Claude APP review. No publication, migration, activation, real applicant processing, new paid call or employer email occurred. All runtime gates remain default OFF and both SQL drafts remain unapplied.

## Exact source and supersession

Current main was re-verified read-only as `ff24fac00fb2c62f15c6d2e75f330ac1d563c82e` at 2026-10-21 14:35 UTC. The six reconciled consultation files are unchanged main content and excluded from the screener patch. The full source manifest includes them for exact reconstruction.

The original delivered `a7d2b1c3b256e423551b5c56b80d50e973be01a3445b7aee5d097518b50e3f3c` review patch and separate cache checkpoint remain preserved. The new full patch targets exact main. The ONE combined delta targets that original delivered source, not the cache checkpoint, and includes explicit caching, professional context, independent quality, notice gates and compact email changes. Packaging verifies patch apply and every complete-source file. Exact artifact SHA-256 values are in the accompanying manifests rather than embedded self-referentially here.

## Executed checks on the final revision

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors and six pre-existing warnings.
- `npx vitest run tests/employer-screening-compact-email.spec.tsx tests/employer-screening-e2e.spec.tsx tests/employer-screening.spec.tsx --testTimeout=15000`: 58 final affected tests passed. These cover the latest renderer, core forwarding and actual-PDF apply-to-email changes. No test assertions or production deadlines were relaxed. A fresh whole-unit-suite green result is not claimed.
- `npm run test:node`: 111 passed, including the durable outbox, private capture and independent document-quality PGlite checks.
- `npm run test:outbox:concurrency`: 11 genuine PostgreSQL tests explicitly skipped because no disposable local PostgreSQL server was available. This is not a concurrency pass.
- Standard `npm run build` with non-secret placeholder Supabase build values: passed.
- Post-build trace smoke: actual isolated builder worker rendered a synthetic PDF using only 337 files from the apply route deployment trace. The final trace includes `pdf.mjs`, `pdf.worker.mjs` and PDF.js package metadata.
- Exact code/config/test/SQL input fingerprints before and after the complete chain are identical: `bed692892e292e7b5c3f689c528ce42e7dd657642b0e59be7e1106ac77f25a17` (712 files). Documentation completion is excluded from this execution fingerprint but included in the final full-source manifest. Packaging rechecks the same input fingerprint.

The earlier standard 5-second Vitest run completed with 2,075 passes, one unchanged 25,001-row admin-query fixture timeout and one existing opt-in skip. That fixture passed in isolation in 4.27 seconds. After later explicit email-copy changes, the bounded final revalidation uses a 15-second test-harness timeout for the affected tests only; parser, capture, provider, database and delivery deadlines remain unchanged. The full earlier result and isolated recheck are disclosed rather than represented as a new complete-suite pass. The first Node run also identified a stale spans-only test expectation that incorrectly prohibited the now-reviewed exact local task prefix “Maintained records”. Its assertion was corrected to permit that reviewed excerpt while still excluding role/company field values, then the final affected tests, full Node suite, type/lint and build/trace checks above were repeated. Both original failure logs are preserved with the review bundle.

## Focused evidence and independent review

The focused compact-renderer/core/apply-to-email run passed 58 tests, followed by an actual synthetic PDF-to-summary preview. The final short HTML hash is `a50300ec34a5da8983d472743735aff8188e0b02f25a10c5ca31de8fa370fba7`. Its 70 supported / 30 unresolved match points are explicit offline fixture findings, not a new model response; the separate local presentation report remains stored internally. The user instructions at that v3 checkpoint removed presentation numbers and visible AI-reviewed labels from the employer email. Grounded nonnumeric notes and partial/not-assessed wording precede Highlights, To verify and Job match. Job evidence is labeled unverified, not human-reviewed; the employer footer uses a line break. The separate applicant AI-processing notice remains intact. No provider or email call occurred.

Reviewed privacy/professional fixtures cover ordinary hospitality, administration and trades statements, exact source binding, whole-record privacy omissions, cross-page/metadata/typed-builder qualifiers, malformed citations and explicit exclusion guards. Quality tests include real JobLink builder render/extract, placeholder gaming, ordinary stacked entries and unknown second-entry boundaries. Independent read-only reviewers closed all concrete findings in the reviewed paths, including unknown-credential wording. Their review is not a claim of general semantic correctness or a substitute for the final external review.

## Explicit limitations and activation prerequisites

- The separate presentation report is a finite local text-organization/evidence-presentation rubric, not comprehensive prose-quality, visual-style, grammar/native-language polish or candidate-merit assessment. Unknown dimensions are excluded from its denominator.
- Professional projection uses a bounded reviewed vocabulary and conservative whole-record filtering. This reduces risk; it does not prove universal de-identification, complete context understanding or broad terminology coverage. Formatted credential rows containing issuer/date details can be omitted. Source spans prove source presence, not the truth or semantic interpretation of a claim.
- No new live model accuracy or prompt-injection evaluation was run for the expanded contextual boundary. The preserved real fictional Luna 70/30 demonstration tested the earlier skills-only request, not this new path or quality. More paid tests require new approval.
- Local runtime was Node 24.19.0. No hosted Node 22/Vercel deployment, real PostgreSQL concurrency, migration application, operational scheduler/webhook/storage integration or actual email delivery was tested. The local worker trace is packaging evidence only.
- Final exact-revision Claude APP review and fixes/retests remain pending. Publication still requires separate approval. Operational activation additionally requires the documented database/hosting/rollback tests, private capture and cleanup policy, sender/receipts/scheduler monitoring, owned approved rubrics, applicant notice and expanded OpenAI data-sharing/retention approval, approved rates/budget and all explicit gates. The notice version marker is not legal consent; no live privacy policy changed.
- Existing unrelated Next/sharp/source-map-js advisories remain documented in dependency-review.md; this patch does not certify the rest of the application.
