> Historical checkpoint: this report describes the original a7d2b1 review bundle. The later document-quality, contextual professional-evidence and notice scope supersedes that source freeze; see quality-final-verification.md for its final checks.

> This is the original frozen-bundle verification. A later explicit-cache cost-bound correction supersedes the provider request configuration; see cache-cost-correction.md for its scope and fresh verification.

# Exact integration verification — 2026-10-21

## Status and revision

Ready for independent exact-source review, not activation. Source, dependency, configuration, SQL and test inputs are frozen; only verification records, manifests and whitespace normalization in the saved fictional HTML examples are prepared after the checks. No publication, migration application, environment/credential change, scheduler/webhook setup, real applicant processing, paid provider request or real email occurred in this integration work.

The patch targets verified main `ff24fac00fb2c62f15c6d2e75f330ac1d563c82e`. The cloud checkout's original HEAD remains `67f977d2bb0e9e3508397944f2b2bae0537b8b34`; the six unrelated current-main files were copied exactly and Git-blob-verified. They are excluded from the screener patch. The original 26-file handoff remains preserved separately. Do not stack this patch onto the stale foundation/V2 branches: use a fresh exact-main worktree.

## Post-last-code-edit checks

- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors and six pre-existing Next.js navigation warnings.
- `npm run test:unit`: 120 files passed, one existing opt-in real-email file skipped; 1,984 tests passed, one skipped. No real email was sent.
- `npm run test:node`: 103 passed, zero failed/skipped, including 37 durable-outbox and 22 private-storage assertions.
- `env -u OUTBOX_TEST_DATABASE_URL npm run test:outbox:concurrency`: all 10 genuine PostgreSQL tests explicitly skipped because no disposable local PostgreSQL is available. These are wired into the existing CI PostgreSQL service, not claimed as passing locally.
- `npm run build`: standard Next.js 16.3.6 Turbopack production build passed with placeholder public Supabase build configuration, no live services.
- Final deployment-trace smoke: the actual builder worker rendered a valid 2,337-byte fictional PDF using only the final apply route's 337 NFT-listed entries copied into an isolated temporary tree. PDF.js `pdf.mjs`, `pdf.worker.mjs`, and `package.json` runtime assets are present.
- `git diff --check`: passed.

The full chain completed after the last code edit on 2026-10-21. Runtime verification used Node 24.19.0 in this cloud workspace; a deployed Node 22/Vercel smoke was not run.

The verification-input SHA-256 was identical before and after the full validation chain: `ee978a1ac786f09ee69e3588d3d7b268feeec941dd14e1843ff6c341d92f75be`. It covers 705 code/config/dependency/test/SQL and unchanged base files, excluding Markdown verification records and generated example artifacts. The delivered manifest additionally hashes every full-source file, including documentation.

Unit coverage includes real synthetic text/encrypted/scanned/corrupt/oversized PDFs, exact evidence offsets, CPU-loop worker termination, strict privacy projection, model-output/budget failures, bounded builder reads/rendering, authenticated rubric approval, signed receipts, transport outcomes and seven synthetic apply-to-original-email scenarios. Provider/email fetches are mocked. Node tests include durable PGlite state/authorization/accounting assertions and restrictive private storage-role tests. These are not real multi-session PostgreSQL evidence.

Earlier parallel UI runs hit a five-second timeout in an unchanged 25,001-row query fixture under competing build load. The complete serial run passed; the default unit runner now uses one worker to bound shared CI resources. Genuine transaction concurrency is tested separately, not inferred from serial unit tests.

## Review corrections included

- A valid ordinary forwarding baseline survives missing CV, missing rubric, corrupted optional snapshot, provider/budget failure and scoring expiry.
- Frozen routing/bytes, atomic persisted path selection, lease fencing and receipt-based reconciliation prevent a late second scoring email or blind uncertain resend.
- Aborting before email dispatch lets the outcome-aware transport report definite non-dispatch during a bounded cancellation grace; a hung attachment read is retryable, while an uncooperative/post-dispatch transport remains uncertain.
- The budget start CAS refuses a reservation from another UTC day without refunding or reallocating its charge. Caps use the database's UTC dispatch-authorization day, not an upstream billing-calendar guarantee.
- Builder input and database/storage response bodies are bounded before cloning, SDK parsing or Blob allocation. Expensive rendering runs in a terminable worker; absolute deadlines are checked around capture and upload.

## Remaining release/activation prerequisites

1. Final Claude APP review of this exact patch, then any fixes and relevant/full retests.
2. Run the 10 genuine PostgreSQL concurrency cases in the existing CI service or another separately approved disposable environment; verify hosted Supabase roles/storage policy, migration/rollback behavior and cleanup/apply races. No local PostgreSQL server was available, and none was provisioned.
3. Separately approve and apply both drafts outside the migration runner. Configure the private PDF bucket, retention/cleanup policy, worker/watchdog cadence and backlog/uncertain-delivery operations. Request/storage lifetime must remain far below the one-hour orphan grace. A network/DB/provider failure cannot be bypassed with an unsafe direct send, and a deadline does not promise inbox delivery.
4. Verify Node >=22.13, supported function duration >=180 seconds, traced runtime assets, memory/load capacity and deployment-specific PDF/storage/email smoke tests. Workers have V8/time/input limits, not an OS/RSS/native-memory sandbox.
5. Approve employer-owned rubric versions, limited criteria coverage and real-data processing/retention terms. Uploaded text PDFs work, but OCR and arbitrary résumé-prose/experience/credential inference do not. Unsupported or missing evidence is unknown/unavailable, never an automatic adverse employment decision.
6. Approve exact model/rates/full-context bounds, per-application and UTC dispatch-authorization-day operating budgets, credentials, verified sender and signed receipt webhook. The earlier fictional probe is not authorization for ongoing spend or data processing.
7. Enable explicit default-OFF gates only after these checks and approvals. A merge alone does not activate the feature. Keep worker/receipt/cleanup draining available during rollback of new applications.

Existing Next/sharp/source-map-js high-severity dependency findings were verified as pre-existing and not newly exposed by the text-only screening path; see dependency-review.md. They remain separate maintenance risks, especially the authenticated logo parser's sharp dependency. No whole-app security clearance is claimed.

## Review artifacts

The handoff directory contains the exact current-main patch, a SHA-256 file/base manifest, a complete source archive, validation logs, and JSON patch chunks below 16,000 characters. Concatenate `chunks[].text` in index order without separators, verify the patch SHA-256, then apply onto exact main. The artifact manifest records hashes; no self-referential hash is embedded here.
