# Codex subscription route: synthetic adapter only

Prepared 2026-10-21. No authenticated inference, account inspection, credentials,
configuration changes, real applicant processing, email sends, or production wiring.

## What this milestone adds

- A fixed fictional Office Assistant fixture, with no runtime résumé/prompt inputs.
- A Codex CLI invocation plan using noninteractive `exec`, stdin, strict JSON output
  schema, read-only sandbox, no interactive approvals, ephemeral sessions and ignoring
  user configuration. These flags were verified against this cloud CLI's help output.
- Strict parsing and existing criterion/evidence validation. The model would return
  findings and source IDs only; numeric score remains deterministic in existing code.
- Bounded wall time, cancellation, combined output cap, generic error handling and
  subprocess termination on failure. No inherited environment, no shell interpolation.
- A real local Node child-process mock proving input/output plumbing, failure handling,
  and validation. The fake outputs 70 supported points and 30 unresolved points.

Reproduce: `node --import tsx scripts/demo-codex-screening.ts`.
This script is mock-only and rejects arguments. It never invokes Codex or an AI model.
Output is labelled `LOCAL_MOCK_NOT_AI` in
`artifacts/employer-screening/codex-mock-report.json`.
Tests: `npx vitest run tests/codex-screening-adapter.spec.tsx`.
There is deliberately no live mode and no fallback to a billable API.

## Actual integration boundary

`probeSyntheticCodex` requires an injected runner. The CLI invocation is built but not
executed by the shipped demo. `boundedSubprocess` is generic process machinery tested
against local fakes only. Its sole environment entry is `NODE_ENV=test`; therefore it
neither discovers nor copies existing account authentication. Creating a real runner
requires a separately approved authentication and isolation design. Passing arbitrary
code as a Runner is not a security boundary; only trusted operator code may supply it.

Codex read-only sandbox limits writes, not confidentiality. Prompt instructions are not
access controls. Before real Codex execution, isolate the worker in an OS/container
boundary that exposes only a pinned approved executable, the synthetic fixture/schema,
and explicitly approved authentication. Prevent user/project config, plugins, hooks,
MCP servers, arbitrary file reads and tool/network access beyond the model service.
Do not run the future real process in the application's checkout or a credential-rich
home. An isolated cwd alone does not enforce those restrictions. The generic subprocess
uses process-group termination on POSIX; this is not an OS security sandbox or a promise
to stop a deliberately escaped child. Production needs container lifecycle enforcement.

## Outstanding, not solved by this adapter

1. Verify subscription use is appropriate for the exact JobLink production purpose.
2. Obtain approval for persistent auth setup in the chosen trusted cloud runner; do not
   copy existing auth files/secrets or create grants without approval.
3. Verify account data-training/retention settings and applicant-data handling before any
   real résumé is sent. No settings have been inspected or changed in this milestone.
4. Run the fixed synthetic fixture through actual approved Codex auth and assess semantic
   quality. Mock test success is NOT successful AI inference or a calibrated screener.
5. Implement durable queue/storage, production isolation, retry/reconciliation and the
   single existing employer-forward path described in README/outbox-contract. Handle
   shared Codex rate limits without dropping applications or assigning a zero score.
6. Test and approve production deployment separately. No live route imports these scripts.

Documentation researched by the parent, checked 2026-10-21:
- https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/pricing
- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan

The official private automation path can use account limits instead of API-key billing.
That technical capability is not confirmation of this exact public-service use case.

## Independent review notes

The exact mock milestone passed independent review. Structural evidence validation is
not semantic truth validation: a model can cite an existing snippet while interpreting
it incorrectly. Semantic calibration and adversarial evaluation remain required.
The fixed mock does not create descendant processes. The generic helper kills a POSIX
process group on abort/error, but not after a successful exit; production container
cleanup must prevent surviving descendants. Windows cleanup only kills the direct child.

## Verification (2026-10-21, final code)

- Focused adapter/foundation: 34 tests passed (16 new adapter tests).
- Full serial Vitest: 1,762 passed, 1 skipped; 109 files passed, 1 skipped.
- TypeScript typecheck: passed. Changed-script/test ESLint: passed.
- Node suite: 44 passed via `node --import tsx --test` with the same test file list.
  `npm run test:node` itself could not start because tsx's IPC socket is restricted;
  no socket restrictions were changed or bypassed.
- Next.js production webpack build: passed.
- Mock child-process dry run: passed, explicitly no real Codex inference.
- Independent reviewer: no blockers for this mock-only milestone; caveats above.
- No commits, pushes, releases, account changes or production changes.
