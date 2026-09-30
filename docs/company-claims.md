# Company claim links

An admin-created company starts with an `admin-company-…@joblinkantigua.com`
placeholder owner. Claiming transfers that existing company to a verified
employer account. It does not create a second company or merge accounts.

## Admin workflow

1. Post the vacancy through **Admin → Post a Job** as usual.
2. Open **Company Claim Links** (`/admin/jobs`), also linked from the admin
   posting screen. Find one of the company's jobs and select **Copy claim link**.
   Only companies still owned by a placeholder have this button.
3. Verify that the recipient is authorized to represent the company. Send the
   copied link privately through your normal channel. JobLink does not send it
   automatically. Treat the link like a password: anyone holding it can claim
   using an eligible, verified employer account. `email_hint` is optional
   internal context, not an identity or authorization check.
4. The employer opens the link, creates an employer account or signs in,
   verifies their email, returns to the company preview, then selects
   **Claim this company**. They arrive at their dashboard with a confirmation.

Links expire 30 days after generation. Re-copying within the same mounted
button reuses that link; generating another link does not extend an earlier
link's expiry. Claiming invalidates every other outstanding link for that
company through the ownership check. Used, expired and invalid links show a
friendly error. An admin can revoke an unused link by setting its `expires_at`
to the past through an authorized admin/service operation. There is no public
lookup or token-management endpoint.

Seekers must sign out and use an employer account. Employers already managing
another company must contact **employers@joblinkantigua.com**; no automatic
merge or name-based takeover occurs. Creating/renaming a company to the
case-insensitive trimmed name of a placeholder-owned company is rejected by a
Postgres trigger with the same contact guidance. New names work as before.

## Migration and deployment prerequisites

Apply `supabase/migrations/20260930_company_claims.sql` through the project's
reviewed migration process **before** deploying this code. See
[deployment.md](deployment.md): production migration history must be reconciled
before any blanket `supabase db push`. This PR does not apply a live migration.

The migration builds on the existing admin RLS fix and both security-hardening
migrations. It adds `companies.claimed_at`, the RLS-protected `company_claims`
table, two service-role-only RPCs and the duplicate/claim-field protection
trigger. Existing environment variables suffice; no new account, key or paid
service is needed. The database migration owner must be able to update
`auth.users.banned_until` and delete `auth.sessions` and `auth.refresh_tokens`.
Verify these standard Supabase Auth columns and grants in staging; no Auth
schema changes are made. A disabling error rolls back the whole claim.

Supabase Auth's redirect allowlist must accept the existing
`/auth/verify-confirm` and `/auth/callback` URLs, including their query strings.
For a custom confirmation template, prefer an anchor whose href is
`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` (HTML-escape `&` as
`&amp;`). `emailRedirectTo` already includes `?type=signup` and a safe `returnTo`.
The standard `{{ .ConfirmationURL }}` path also supports the code/session flow.
See [Supabase email template variables](https://supabase.com/docs/guides/auth/auth-email-templates).
Do not modify the live template or URL allowlist without the normal release approval.

For custom templates that drop the return query or verification in another
browser, signup also saves a narrowly validated `claim_return_to` routing hint
in that user's Auth metadata. Verification clears it before navigating. It
never authorizes a claim: the server always checks the token and session again.
Do not log Auth metadata/JWTs or full claim/verification URLs. Claim paths and
claim-bearing auth URLs are excluded from analytics; auth/claim pages send
`no-referrer` and `no-store` headers.

## Atomic transfer and security

`POST /api/admin/company-claims` validates the admin's server-side session,
generates 32 cryptographically random bytes encoded as base64url, and calls
`create_company_claim`. That RPC locks and checks the company owner and admin.

`POST /api/claim/[token]` validates the session and both email verification
flags, rejects cross-origin requests, and supplies only the authenticated user
ID to `claim_company`. The service-only RPC locks the claimant, company and
token and rechecks role, bans, ownership, expiry and prior use. It uses
`clock_timestamp()` so waiting for a lock cannot extend a token's life. The
existing unique company-owner constraint prevents concurrent creation of a
second company.

In this schema, jobs have `company_id`, **no separate employer/user owner
column**. Updating `companies.user_id` transfers all its jobs and application
access through existing RLS without changing IDs. `posted_by_admin` stays true,
`claimed_at` is recorded on company and token, and the placeholder is disabled
in the same transaction: public `is_banned=true`, public verification cleared,
Auth `banned_until=9999-12-31`, and sessions/refresh tokens removed. A finite
far-future timestamp is used for compatibility with Auth clients' date parsers.
The placeholder is retained for audit and foreign keys and cannot sign in or
refresh. Previously issued JWTs expire normally, but no longer own the company
or its jobs and cannot pass this app's session/ban checks.

The public job-page disclaimer was already removed on the base branch; it
remains hidden after claiming. The employer-approved Google JobPosting
allowlist, listing eligibility and existing admin posting API are untouched.
Claiming alone does not grant Google Jobs authorization or a verified badge.

## Tests

- `npm run test:node`: real Postgres semantics in PGlite, using local Auth/storage
  fixture tables. Covers transfer, history, token reuse/expiry, role/verification
  checks, ownership conflicts, rollback, RLS/execute grants and duplicate names.
- `npm run test:unit`: route authentication, random tokens, HTTP errors, claim
  return continuity, cross-device verification hint, analytics exclusion and
  repeated button clicks, alongside existing tests.
- `npm run test:claims:concurrency`: real simultaneous connections to PostgreSQL.
  Set `CLAIMS_TEST_DATABASE_URL` to a **fresh local** database named
  `joblink_claims_test`. Other hosts/names and nonempty databases are refused.
  CI provisions a disposable PostgreSQL service. Without the variable these
  five tests explicitly skip. Tests verify competing claims, different tokens,
  two-company claims, expiry during a lock wait and concurrent profile creation.

Local fixtures do not verify a hosted Supabase email template, mail delivery,
OAuth provider configuration or actual GoTrue sign-in after disabling. Before
release, run the acceptance journey in an approved staging Supabase project,
including a private-window signup, email verification in another browser, a
successful claim, second-use failure, expiry and placeholder sign-in denial.
