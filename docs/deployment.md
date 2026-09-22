# JobLink restoration and release runbook

The September 2026 fixes require both the application release and seven additive SQL migrations. Do not deploy only one side. Keep a backup and a working previous deployment available. No production data migration has been executed by this remediation task.

## Observed production drift (22 September 2026)

Read-only catalog inspection in the authenticated Supabase dashboard for `Joblink database` confirmed:

- `subscriptions`, `ai_purchases`, `ai_usage`, `ai_resume_previews` and the extra CV-section tables already exist outside Git migration history.
- `ai_purchases` has `purchased_at`; previews have an `id` primary key and a unique `user_id`; project/volunteer dates are text. The compatibility migration preserves existing tables and these values.
- `conversations.application_id` is nullable for direct invitations.
- The messaging function signatures match Git, but the four user-ID functions have PUBLIC/anon/authenticated EXECUTE, no fixed search path and no `auth.uid()` in their definitions.
- No protective triggers exist on users, companies or job listings. The new migrations explicitly install the June user protection rather than assuming it was deployed.
- Live messaging policies use names such as `cp_insert` and `conv_insert`; the new migration closes these paths as well as the old names.
- `supabase_migrations.schema_migrations` is absent. Do not run `supabase db push` against this project until a reviewed baseline and migration history have been established.

Google is enabled. The live Site URL is https://joblinkantigua.com and the redirect allow-list includes /auth/callback, /auth/callback/reset and the canonical-domain wildcard. An existing signed-in app dashboard is accessible; a fresh OAuth flow remains untested.

No user-message content, résumé file or payment record was used to test these findings.

## Before applying changes

1. Confirm the database is restored and take/export a recoverable backup using Supabase. Verify that the backup can be restored to an isolated project. Do not infer backup readiness from a green page alone.
2. Export schema, policies, grants, functions and triggers (not production row data) and compare against the migration assumptions. Inspect existing duplicate non-null `stripe_session_id`, `stripe_subscription_id`, and preview `user_id` values before adding unique indexes. Resolve duplicates with a reviewed data-preserving plan; never delete them automatically.
3. Identify an explicitly isolated Supabase test project. Do not use an unrelated project as a test target. The local PGlite tests validate PostgreSQL transactions/RLS with synthetic auth/storage schemas; they do not replace GoTrue, PostgREST, Storage, Realtime or OAuth integration tests.
4. With production kept in maintenance if necessary, apply only `202609220001` through `202609220007` in order to the isolated schema first. Each file has a transaction. Existing duplicate data or incompatible definitions should stop the migration rather than be silently rewritten. Record reviewed schema changes in deployment history; do not mark unknown historical migrations as applied.
5. Run the isolated integration checklist below. Review the SQL and application diff together before applying the same migrations to production and releasing the application.

`supabase/reset/` contains historical destructive scripts only. They were removed from the ordinary deployment path. `00002_fresh_schema.sql` is a blocking historical marker; it deliberately refuses execution. These files are not restoration tools. Historical migration ordering also places message-attachment SQL before message creation, so replaying the entire old directory is not a supported fresh-install procedure. `tests/database.ts` supplies an explicit disposable bootstrap order for local tests.

## Environment and hosting

Run `npm run check:env` with the deployment environment loaded. It prints missing variable names, never secrets. Configure the Supabase URL/public key/service-role key for the same project. Keep the service-role key server-only. Set both public application origins to the canonical domain, `https://joblinkantigua.com`.

Stripe requires the correct test/live secret key, Pro price ID, Smart Resume price ID and **STRIPE_WEBHOOK_SECRET for this endpoint**. Register `/api/webhooks/stripe` for checkout completion, async checkout payment success, subscription created/updated/deleted, invoice payment succeeded and invoice payment failed. Do not paste production secrets into commits, reports or chat.

For Google sign-in, verify Supabase Site URL and allowed redirect URLs include the canonical `/auth/callback` route; check the OAuth provider's redirect URI points to the restored Supabase project's `/auth/v1/callback`. Test with controlled seeker and employer accounts. Existing cookies accessing the dashboard prove only that an existing session works, not a fresh Google OAuth flow.

Vercel is the sole active scheduler. The repository disables Netlify schedules. Disable any remaining Netlify scheduled functions in the old deployment as well. Verify the Vercel plan supports the configured hourly and ten-minute schedules; if not, choose one supported scheduler and remove the competing schedules. Do not silently omit the outbox worker. The outbox worker runs every ten minutes and reports HTTP 503 for failed deliveries or records needing review.

`MAINTENANCE_MODE=true` returns a website maintenance page with HTTP 503 and Retry-After; API endpoints retain their own authentication and error handling so webhooks and recovery tools can operate. Disable maintenance only after health and authenticated tests pass.

Use `/api/health` as the readiness monitor. It checks the public database API and auth health, returns 503 on failure and is uncached. It does not prove that Google OAuth, private policies, Storage or all tables work. Server render errors show a retry page; streamed Next.js pages may already have committed HTTP 200, so HTML status alone is insufficient. Missing job/company IDs use Next.js notFound/404.

## Payments and outage reconciliation

The webhook verifies the original signature, refreshes Stripe subscription state, and calls one service-only SQL transaction. The transaction inserts the event ID and writes the purchase/subscription/entitlement together. A failure rolls back the event and returns 500 so Stripe retries. Unique checkout-session IDs prevent duplicate purchases. Subscription events carry their creation timestamp; older events cannot replace newer state, and canceled subscriptions cannot be reactivated by an older snapshot. Entitlement is recomputed across active subscriptions. Purchases before company creation remain linked to the user and attach when the company is created.

After restoration and migration, run a read-only inventory with dates covering the outage:

```sh
npx tsx scripts/reconcile-stripe.ts --from 2026-09-01T00:00:00Z --to 2026-09-23T00:00:00Z
```

Adjust dates to the actual outage. Review missing events, existing purchases and entitlements. Only then use `--apply` to replay through the same idempotent SQL transaction. Stripe's Events API has a limited retention window; obtain older evidence from Stripe's dashboard/exports when necessary. A new event ledger starts empty, so absence from the ledger does not prove a historic payment was lost. Unknown ownership must be investigated, not assigned to a guessed user. The script reports IDs/types/statuses only and does not print customer data or secrets.

## Résumé and CV behavior

The full AI draft is visible before payment/saving. The generator rewrites supplied facts only, leaves unknown dates null, asks follow-up questions, and validates structured output. Truncated output is rejected. Users must review and confirm replacement. A preview version check prevents an older browser tab from saving a newer unseen draft. The six replaced sections, summary, completion percentage and preview removal share one transaction; awards/certifications/memberships/references are preserved. Dates that were never supplied are not invented.

CV downloads require an owned Storage object in the profile owner's directory with matching `owner_id`. Legacy objects without valid ownership will fail closed: resolve ownership from trustworthy upload history or have the candidate re-upload; never rewrite ownership based only on the editable profile path. Signed links last five minutes. Existing already-issued links remain usable until expiry.

Both actively-looking and open candidates are discoverable. Uploaded CV downloads and generated PDF exports require an active Pro employer plus discoverable visibility, an existing application relationship, candidate ownership, or authorized admin access. `not_looking` does not authorize unrelated Pro employers.

## Reminder delivery

Daily cron and admin reminder actions enqueue the same stable key. A transaction claims each email for five minutes. Sends use the same recipient/template data and Resend idempotency key on retries. A second transaction marks delivery and writes the historic reminder log together. Missing configuration or provider/database failure never marks a reminder delivered.

Resend deduplicates for 24 hours. Ambiguous deliveries stop automatic retry after 23 hours and become `needs_review`. Check provider delivery records before resolving or resending those records; do not reset them all to pending. Monitor `/api/cron/email-outbox` failures and outbox backlog. Deploy template changes with awareness that provider retries require identical payloads.

## Validation

Local commands:

```sh
npm ci --ignore-scripts
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run smoke
npm audit
```

`npm test` uses an isolated in-memory PostgreSQL runtime with synthetic users/files and mocked external calls. `npm run smoke` starts a local production server on port 3188 (override SMOKE_PORT), with an unreachable database and dummy public key. It never connects to production.

Required isolated Supabase/provider acceptance tests:

- Two seekers and unrelated employers: own profiles work, cross-user inbox/meta/unread/presence requests fail, direct message reads/inserts stay isolated.
- Employer creates a pending listing; direct approval/featured/Pro/verified/customer-ID tampering fails. Concurrent free-listing inserts leave at most one live/pending slot. Approved-content edits return to moderation.
- Candidate applies, employer replies, candidate responds. Rejection blocks further candidate messages. Direct employer invitation without application still works.
- Open and actively-looking profiles appear; private profiles/files/exports are denied to unrelated Pro employers. Apply the relationship rule with a private applicant. Test real Supabase Storage owner IDs using synthetic PDFs.
- Stripe test checkout, delayed and duplicate signed events, pre-company purchase, expiry/cancellation, multiple subscriptions, database failure and retry. Verify one durable purchase and correct entitlement. Reconcile outage-period production events separately.
- Valid and malformed/truncated AI drafts; zero-work-experience intake; explicit replacement confirmation; stale preview; database failure midway through replacement. Old CV and preview survive failed transactions.
- Concurrent cron/admin reminder run, provider rejection, DB failure after provider success, retry within deduplication window and review state outside that window.
- OAuth login, logout and callback using controlled accounts on the canonical domain; health failures, empty database, real missing IDs and maintenance response.

References: [Stripe webhook delivery and retries](https://docs.stripe.com/webhooks), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Next.js security advisories](https://github.com/vercel/next.js/security/advisories).
