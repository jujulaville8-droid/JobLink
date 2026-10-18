# Résumé writing: bounded local MVP

Status: uncommitted local review on `codex/resume-purchase-foundation`, based on main `e086afb36c7f3d64be9a6fbd3f84aea7c821e5dd`. Checkout and intake submission are disabled by default. The migration below has only run in isolated in-memory Postgres tests. Only read-only connector-context discovery was used; no live database, Stripe payment objects, runtime settings, secrets or private applicant records were accessed or changed. No push, merge, deployment, messages, uploads or payment was attempted.

## What is implemented

The existing free résumé editor now includes an optional EC$50 one-time writing package: a basic first one-page résumé, guided intake, draft, one revision, PDF and editable copy. Julian approved the customer-facing timing: first draft by the next day after payment and a complete questionnaire. This does not promise a fixed 24 hours or business days. Unsaved free-builder edits remain mounted and editable throughout the service flow. No builder/profile data is copied into intake automatically.

1. A verified seeker can review a small bounded intake (name, delivery email, target role, optional education, skills and experience). Unsaved intake stays in page memory. Explicit consent and approved server-supplied terms are required before saving.
2. A server route persists an immutable intake and terms snapshot with the authenticated owner, fixed package/currency/amount, an idempotent request UUID, server-selected payment-policy binding and a separate server-generated opaque checkout reference. The policy binds mode, account, link, price, product, URL and amount. Owner/admin reads and checkout filter that policy; the SQL rejects a payment from a different policy even if the opaque reference matches. Saved recent requests can be reopened after reload. Other owners cannot start checkout for them.
3. Only a saved unpaid request under the current terms can prepare checkout. The server verifies the merchant and staged link/product/price/quantity. The link must already be active; this code never activates it. Its URL contains only `client_reference_id`, never name, email, résumé text or profile details. The actual external link opens a new tab with `noopener noreferrer`; merely preparing it does not navigate or charge.
4. A signature-verified webhook routes résumé events before legacy employer subscription processing. Authoritative Stripe retrieval verifies the exact account, link, product, price, quantity, XCD5000, selected sandbox/live mode, complete payment, succeeded PaymentIntent and captured charge. Return URLs and client-supplied paid claims are never payment evidence.
5. One database transaction records event, unique receipt and order association. Failed/expired/unpaid sessions do not grant work. Replay is safe, and uniqueness prevents a session/PaymentIntent/charge being reassigned. Unmatched opaque references enter a minimal private event queue without granting payment. Extra receipts, any refund (including partial) or dispute create a sticky payment-review hold. A primary payment recheck or even a full refund of an extra receipt never clears the hold automatically. Fulfillment progress is stored separately and never overwritten by a payment hold: writing/revision/completed states remain intact. There is intentionally no generic clear-hold control; resolution requires an explicitly approved future path/operator procedure. Refund-before-completed is reconciled by its PaymentIntent's Checkout Session.
6. `/admin/resume-writing` exposes paid/refunded/disputed intake to admins, a minimal unmatched-payment queue, manual authoritative session reconciliation and versioned fulfillment transitions. Every work/delivery transition rechecks payment at Stripe, then the database rechecks admin status, payment state and optimistic version. The states are ready → writing → draft ready → one revision requested → writing → draft ready → completed manually. Completion requires an explicit attestation that final PDF and editable copy were delivered manually. This UI sends no files or messages and provides no upload/download subsystem.

## Storage and access

Local-only SQL: `supabase/migrations/20261017010000_resume_writing_orders.sql`.

- `resume_writing_orders`: private owner/intake/terms/consent snapshot, fixed package, opaque reference, payment/checkout/fulfillment/revision state and version.
- `resume_writing_receipts`: unique Checkout Session, PaymentIntent and charge associated with exactly one order; primary receipt uses a composite foreign key.
- `resume_writing_events`: atomic idempotency ledger and minimal unmatched queue, without raw webhook payloads or customer details.
- `resume_writing_actions`: admin actor and manual status-transition audit.

All four tables have RLS. Authenticated users receive only order SELECT with owner/admin and banned-account checks; anon has no access. Browser roles cannot write tables or call mutation functions. Only the service role can create/reconcile/update, using security-definer functions with a fixed search path. HTTP responses are private/no-store. Mutations require same-origin requests and strict bounded JSON; seeker writes/checkout use a fail-closed shared rate limit. Intake is escaped as React text. Existing CV tables/storage, `ai_purchases` and employer subscriptions are not used as order storage.

## Verified staged Stripe resources

The parent's separately authorized connector worker supplied these non-secret identifiers. This implementation worker did not access the Stripe account:

| Resource | Verified staged value |
| --- | --- |
| Merchant | `acct_1TChXLCucQcu2n8C` (Joblink, CA business country, CAD settlement, cards/charges enabled) |
| Product | `joblink_first_resume_xcd50_v1` |
| Price | `price_1UR4M8CucQcu2n8Cq3fsP01o`, one-time XCD5000 minor units, quantity 1 |
| Payment Link | `plink_1UR4MHCucQcu2n8CMrna7wGD` |
| Exact hosted URL | `https://buy.stripe.com/4gM00igUY0m7eWKdyecV200` |
| Activation | Inactive/staged; activation remains separately blocked |

EC$50 means XCD50.00; no invented USD/CAD conversion or fee estimate is shown. Presentment currency is distinct from settlement currency. See Stripe's [currencies documentation](https://docs.stripe.com/currencies) and [fulfillment guide](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted).

The existing `/api/stripe/checkout` and `/api/stripe/create-checkout-session` routes are employer subscription paths. They remain separate. The existing signature verification and legacy webhook handling remain intact for unrelated events; résumé events use their own atomic ledger before the legacy event claim.

## Exact runtime configuration

New non-secret variables, none configured by this change:

| Variable | Requirement |
| --- | --- |
| `RESUME_WRITING_ENABLED` | Only literal `true` enables private order storage and résumé webhook handling. Default off. |
| `RESUME_WRITING_CHECKOUT_ENABLED` | Separate literal `true` enables checkout preparation. Default off; approved terms and the first flag are also required. |
| `RESUME_WRITING_PAYMENT_MODE` | Explicit `sandbox` or `live`; missing/invalid mode fails closed. The browser cannot choose it. |
| `RESUME_WRITING_TERMS_VERSION` | Approved immutable terms version, at most 100 characters. |
| `RESUME_WRITING_DELIVERY_TERMS` | Approved operator/channel and editable format, including the agreed first draft by the next day after payment and a complete questionnaire. |
| `RESUME_WRITING_REVISION_TERMS` | Approved scope and response window for the included one revision. |
| `RESUME_WRITING_REFUND_TERMS` | Approved cancellation/refund terms. |
| `RESUME_WRITING_PRIVACY_TERMS` | Approved intake access, manual handling and retention terms. |

All four terms texts must be present and bounded before intake can save; existing saved requests retain their agreed snapshot. Changed terms require a new request before checkout. Existing owner status reads remain available when terms are incomplete as long as the service flag remains on. Do not turn the service flag off after accepting payments as a checkout kill switch: keep reconciliation available and disable only `RESUME_WRITING_CHECKOUT_ENABLED` to pause new checkout preparation.

Sandbox mode requires these five non-secret server pins, with no live fallback: `RESUME_WRITING_SANDBOX_ACCOUNT_ID`, `RESUME_WRITING_SANDBOX_PAYMENT_LINK_ID`, `RESUME_WRITING_SANDBOX_PAYMENT_LINK_URL` (canonical `https://buy.stripe.com/test_...`, no query/fragment), `RESUME_WRITING_SANDBOX_PRICE_ID`, `RESUME_WRITING_SANDBOX_PRODUCT_ID`. Currency/amount remain fixed at XCD5000. Live mode uses only the staged pins above. The owner/admin screens label sandbox test mode, and the owner accepts the server-returned canonical sandbox/live link rather than a hard-coded live path. No mode/resource override is accepted in request bodies.

Credentials are separate server-only variables: sandbox uses `RESUME_WRITING_SANDBOX_SECRET_KEY` (restricted `rk_test_` preferred, or `sk_test_`) and `RESUME_WRITING_SANDBOX_WEBHOOK_SECRET`; live uses `RESUME_WRITING_LIVE_SECRET_KEY` (`rk_live_` preferred, or `sk_live_`) and `RESUME_WRITING_LIVE_WEBHOOK_SECRET`. Wrong-mode key prefixes are rejected. There is no fallback to employer `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`, and keys/secrets are never returned in configuration/order responses or logged. Credentials were not supplied or read; tests use explicit synthetic values without provider calls. Keep sandbox and live database/auth configuration in isolated environments.

The existing `/api/webhooks/stripe` endpoint verifies résumé events against the selected résumé signing secret before any employer handling. A résumé-signed event cannot enter employer entitlements, including unrelated event types. Employer signatures still use the existing separate secret and path. Legacy-signed résumé link events are intercepted before the legacy event claim and use the dedicated résumé client, never the employer API key. Runtime merchant, mode and all resource identities are verified. Existing Supabase variable names remain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; values were not read or written. Required webhook types: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded` and `charge.dispute.*`. Live endpoint/event selection has not been inspected or configured.

## Remaining launch blockers

1. Confirm delivery/operator/editable format, revision scope/window, refund/cancellation and privacy/retention terms. Draft timing is now agreed as next day after payment and a complete questionnaire. The fixture terms are explicitly synthetic and are not defaults or proposed policy.
2. Review and separately approve application of the migration to the intended environment. It has not been applied outside isolated tests. Confirm existing users/auth and rate-limit RPC compatibility there.
3. Verify a sandbox end-to-end flow using approved sandbox pins/credentials and an isolated database target before enabling any live flow: payment → matching private order → replay/concurrency recovery → admin work/manual delivery → owner status. Separate sandbox configuration is implemented; no authorized sandbox resources/credentials or isolated database target are available to this worker. The parent reported only the live Joblink Supabase project `hfcfuvbyqxkvnenfykex` as healthy; no test project was listed. Unrelated projects, including EntryPoint, are not test targets. Local mocks are not proof of sandbox or live payment success.
4. Separately approve/configure the intended merchant webhook/secret, required events, operational payment-review handling and deployment configuration. An unmatched payment cannot be arbitrarily assigned by email. Duplicate payments/disputes require operator resolution; the app does not issue refunds or automatically clear dispute holds.
5. Only after those checks, separately approve deployment, staged Payment Link activation and feature flags. No email, messaging, file upload/storage or automated delivery subsystem is included. Manual document delivery must follow the approved channel and privacy terms.

## Verification

- `npm run test:unit`: 97 files passed, one file skipped; 1,581 tests passed, one skipped after the review fixes.
- Focused run before the final added API/employer regressions: 83 tests in seven files passed. The full run includes all new tests and the three adapted independent employer checkout/renewal/cancellation regressions.
- `node --import tsx --test tests/navigation-state.test.mjs tests/dashboard-loading.test.tsx tests/button.test.tsx tests/admin-discovery-retirement.test.mjs tests/security-hardening.test.mjs tests/company-claims.test.mjs`: 44 tests passed.
- `npm run typecheck`: passed. `npm run lint`: zero errors, seven pre-existing navigation warnings.
- Production build with explicitly synthetic Supabase values: `npm run build -- --webpack` passed compilation, TypeScript and generation of all 115 static pages. The placeholder Supabase hostname produced an expected homepage-data warning. The default Turbopack attempt stayed idle in compilation for over five minutes and was stopped; no compiler error was reported. Neither build used production credentials or deployed anything.

The payment tests execute this exact migration and mutation SQL in isolated PGlite Postgres. They cover owner/admin RLS, forbidden browser writes/RPCs, immutable idempotent intake, authoritative payment evidence, mismatched orders/provider resources, concurrent/replayed events, atomic rollback, unmatched references, duplicate paid sessions, delayed/failed/expired payment, partial/full refund, dispute, out-of-order refund, legal admin transitions, optimistic version, one revision and manual delivery. API tests reject spoofed payment/owner/amount fields, cross-origin writes and unauthorized reads; fresh pre-fulfillment payment failure prevents status mutation. Stripe responses are mocked throughout; no payment API calls were made.

Independent review corrections: the two new regressions first failed on the previous patch, reproducing partial-extra-refund hold clearance and overwritten completed progress. They now pass, including a subsequent primary receipt recheck, full extra refund, and writing/draft/revision progress preservation. Sandbox tests exercise test-session inspection, transaction binding, checkout URL, admin mode checks, credential separation, wrong-mode facts/accounts and actual local webhook signatures. These tests still do not prove real multi-connection Postgres races or Stripe end-to-end behavior.

Supabase security checklist review used the installed `supabase` and `supabase-postgres-best-practices` skills plus the current [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions](https://supabase.com/docs/guides/database/functions) documentation. All exposed tables have RLS; ownership/admin authorization reads server-managed database fields, not editable user metadata; no service credential reaches clients; browser roles have no mutation grants or function execution. The service-only privileged functions use fixed search paths and explicit EXECUTE revocation from PUBLIC/anon/authenticated. Tests now also deny all three mutation RPCs directly and verify banned-owner read denial. No views/storage/dependency changes were introduced. Live advisors were not run because no live database operation was authorized; run environment-specific advisors after approval in the isolated test target. The public changelog showed no relevant local SQL/API migration change requiring a dependency update.

Chrome synthetic fixtures exercised the actual owner/admin components at desktop 1440×1000 and mobile 390×844, with the owner also checked at 320×844. No horizontal overflow or browser errors were found. Verified review/consent/save-before-pay, opaque-only link and new-tab attributes without opening Stripe, server-status refresh removing the payment link, preserved unsaved builder text, successful free save, PDF controls and mobile preview. Admin ready/writing/draft/delivery confirmation/completion were exercised against test-only memory responses; real server authorization/SQL are covered separately above. Default-off screen was also checked. Fixtures are Vite-only test entries, not Next routes or production auth bypasses. Screenshots and full patch are outside the repository in `../evidence/purchase/`.

After the review fixes, Chrome checks at 1440/390/320 pixels also verified the sandbox label and test-link path with only an opaque reference, next-day package wording, retained free-builder draft/save, and completed admin progress with an explicit payment hold and zero fulfillment controls. No browser errors or horizontal overflow were found. Updated screenshots use the `review-fixes-` prefix.
