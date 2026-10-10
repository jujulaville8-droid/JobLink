# Messaging email compatibility

## Functional scope

This correction supports generic message email for application-bound conversations after caller-bound messaging reads were tightened. It preserves the authenticated caller boundary and does not restore cross-user RPC access. A successfully saved message still returns success if notification is unavailable.

The caller routes supply a confirmed saved message ID, conversation ID and server-authenticated sender ID. The notification helper re-reads the saved message and conversation through the sender's client, confirms the sender's own membership, and independently binds the sender and recipient to the applicant and job owner in the persisted application. It also checks the sender's account and uses only a sender-owned display name.

Caller-scoped membership reads need not expose the peer. Only after the independent application ownership binding succeeds does a private server client read the bounded roster for that one conversation. The roster must contain exactly the two distinct application participants. A third-row sentinel rejects oversized rosters, and the sender's per-thread block flag is checked again. Recipient settings, email and cooldown are not read until the roster is validated. No private notification context is returned to callers.

Generic email can proceed in both application-conversation directions only when every visibility, account, roster, preference, block and cooldown check succeeds. The saved message supplies the preview; callers cannot override recipient addresses, preview text or identity labels.

## Delivery behavior

- A successful absent settings row retains the existing default-on preference; a settings read error fails closed
- Explicit opt-out is respected
- Per-thread blocking remains directional: a blocked sender is suppressed, while a blocker can still send
- Provider acceptance is recorded as sent only when the email helper reports success; this does not prove inbox delivery
- A per-message/recipient provider idempotency key reduces retries within the provider's window; cooldown across different messages remains non-atomic
- Database, provider and logging failures do not turn a successfully saved message into an HTTP failure

The invite handler requires a successfully inserted message with a returned ID before invoking the generic notification helper. Its separate legacy `job_invite` email path is unchanged by this correction.

## Deliberate limitations

- Generic direct-thread email remains suppressed pending independently trustworthy persisted invitation provenance. Participant membership alone is insufficient authorization
- Closed or inaccessible application/listing context fails closed. There is no privileged application fallback to broaden the sender's access
- The legacy `job_invite` path still needs separate consent and block-parity review. Restoring generic direct-thread email later also requires coordinating that path to avoid duplicate notifications
- Application-start and status-update side effects, broader messaging write authorization, direct database enforcement, user-wide blocking and complete account-deletion suppression remain separate work
- This is scoped application-email restoration, not a claim that all messaging email is restored

## Generalized verification

The repository tests use synthetic records and fake email providers. They cover persisted message and identity binding, caller-only membership visibility, both application directions, the bounded server roster, malformed or mismatched participants, directional blocking, opt-out, settings failures, cooldown, provider outcomes and direct-thread suppression. They do not reproduce a full hosted database, authenticated runtime or real inbox delivery.

Run these checks on the exact release tree:

- `npm run test:unit -- --maxWorkers=2`
- `npm run test:node`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

When the `tsx` CLI cannot create its local IPC socket, the same Node test files can be run with `node --import tsx --test` followed by the files listed in the package's `test:node` script. This changes the runner invocation, not the test set.

No new dependency, database migration, environment value, credential or mobile import is required. Build checks may use non-secret placeholder values and do not demonstrate live service access. Publication and deployment require their authorized workflow; controlled runtime notification checks require separately approved recipients and send scope.
