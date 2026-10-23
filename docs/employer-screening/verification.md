> Historical milestone, superseded by [README.md](README.md) and [final-verification.md](final-verification.md). Statements below describe the earlier prototype, not the current integration.

# Local synthetic verification — 2026-10-21

This is an offline foundation, not a live screener. No real applicant data, provider
requests, credentials, email sends, repository publication, deployment or DB changes.
Existing application route, notification sender and transport are unchanged.

## Verified

- Complete serial unit suite: 108 files passed, 1 skipped; 1,746 tests passed, 1 skipped.
- 18 screening regression tests plus 31 existing notification/delivery tests: 49/49.
- Existing Node suite using `node --import tsx --test` against the six files listed
  in package.json test:node: 44/44.
- TypeScript: passed. Changed-file ESLint: clean. Full ESLint: zero errors, six
  pre-existing Next navigation warnings outside the changed files.
- `next build --webpack`: passed compilation, type checking and page generation.
  Default Turbopack build cannot resolve this workspace's external node_modules
  symlink; webpack is the permitted local build alternative, not a deployed change.
- Independent second-agent review: no blocking issue within bounded offline scope.

## Regressions covered

Renderer rejects malformed/injected reports to unavailable. Snapshot reads enforce
same invariants as capture, even with a recomputed hash. Send identity is application
ID, not queue row ID. Résumé metadata must match before freezing and retry. Composer
mutation cannot change trusted identity. Processor mutation cannot change immutable
deadline; late results are discarded. Missing/invalid processing is unavailable,
never a fabricated zero. Corrupt snapshot, composition and persistence failures stop
before transport rather than sending untrusted data; production recovery is not built.

## Limits and outstanding release gates

Full aggregate parallel unit run had two resource timeouts (PGlite setup and admin
query test); the complete serial rerun subsequently passed (counts above). Fake-store tests do not
prove durable concurrency, crash recovery or email delivery. Actual PDF extraction,
versioned byte capture, semantic scoring, privacy-minimized provider integration,
durable outbox/leases/reconciliation and single-path application integration are
not implemented. Rubric/provider/data policy and production rollout require approval.

Synthetic HTML generated without sending: artifacts/employer-screening/scored.html
and unavailable.html. They show a fictional candidate and deliberately have no CV
attachment. A local browser screenshot could not be captured because the cloud
sandbox cannot start Chromium sockets; no screenshot was claimed.
