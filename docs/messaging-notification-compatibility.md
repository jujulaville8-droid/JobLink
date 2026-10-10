# Messaging email compatibility after caller-bound RPC hardening

## Scope

This is a web-main-compatible local correction, independent of mobile schemas and user-wide blocking. The four messaging RPCs were separately hardened in production on 2026-10-10. The message POST handler still requested `get_conversation_meta` with the recipient ID using the sender's authenticated client. That request is now correctly rejected. Source inspection establishes that the handler consequently skips the generic email notification while its saved message still returns success. No production message, account read, send, or write was used to demonstrate this regression.

The correction never restores cross-user RPC access. The three caller routes supply a confirmed saved message ID, conversation ID and server-authenticated sender ID. Notification context is reconstructed from sender-authorized persisted records; callers cannot choose recipient addresses, preview text or identity labels. Only after message/participant/application binding succeeds does a private service client read recipient email/settings and notification cooldown. Private context is not returned to clients.

Only a successful absent settings row receives the existing default-on preference. Database errors fail closed, explicit opt-out is respected, and generic delivery uses the persisted body and sender-owned display name. Per-thread directional blocking is preserved: a blocked sender is suppressed, while a blocker may still send. Provider acceptance is logged as sent only when the provider helper reports success. A per-message/recipient provider idempotency key reduces same-message retries within the provider's window; cooldown remains non-atomic across different messages. Exceptions never turn a successfully saved message into an HTTP failure.

The invite handler now requires a successful inserted message with a returned ID before invoking notification. Its separate existing `job_invite` email path is deliberately outside this urgent compatibility correction and still needs consent/block parity review. Application-start and status-update side effects are also outside this patch.

## Main compatibility and verification

All changed existing source files, plus their email/admin/company-email-validation dependencies, were checked against main `8287f23b05b0067fbe1991319262e4be886829c1`. They were unchanged in frozen backend foundation `e2d63fedd394aba021ce2ad3a611a790c9508f60` before this correction. No new dependency, migration, environment value, credential or mobile import is required.

Run `npx vitest run tests/messaging-notification*.spec.tsx --maxWorkers=2`, TypeScript, ESLint and the exact integrated build. Tests use fake email providers and synthetic records only. Exact commit/build/review evidence accompanies the release handoff. A local passing test does not establish real inbox delivery; any controlled runtime check needs separately approved recipients and send scope.

## Remaining gates

- The source change is local until independently reviewed and separately published/deployed through the authorized workflow
- The live RPC restriction remains in place; no SQL change is part of this patch
- Broader messaging write authorization, direct database enforcement, status/invite bypass paths and user-wide blocking remain separate work
- Existing deletion suppression is incomplete and is not made complete by this compatibility correction
- Notifications intentionally fail closed when sender-scoped application/job context is missing or unreadable, including closed/inaccessible listings; no privileged fallback broadens access
- Direct conversations have no persisted listing context, so their generic email title is `a position`
