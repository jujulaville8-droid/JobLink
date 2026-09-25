# Deployment

Vercel serves production. Response headers and successful production runs of
all three cron jobs were verified on September 25, 2026. The legacy Netlify
configuration and cron wrappers have been removed.

## Which host is live?

If you are unsure, check the response headers of the production site:

```bash
curl -sI https://joblinkantigua.com | grep -iE 'server|x-vercel|x-nf-request-id'
```

- `x-vercel-id` present → Vercel is serving.
- `x-nf-request-id` present → Netlify is serving.

## Environment variables

Set every variable in `.env.example`. Three are easy to miss and each fails
quietly if absent:

| Variable                 | Failure mode if missing                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `STRIPE_WEBHOOK_SECRET`  | Every Stripe delivery is rejected; nobody is ever upgraded to Pro. |
| `RESEND_WEBHOOK_SECRET`  | Inbound email forwarding returns 500.                              |
| `CRON_SECRET`            | All three scheduled jobs return 401 and silently never run.        |

`STRIPE_WEBHOOK_SECRET` is the signing secret of the webhook endpoint pointing
at `/api/webhooks/stripe` (it starts with `whsec_`). It is not the API key, and
it differs between test and live mode.

## Database migrations

Apply migrations before the deploy that depends on them:

For a project with reconciled Supabase CLI migration history:

```bash
supabase db push
```

Production was originally managed through the SQL editor and had no
`supabase_migrations.schema_migrations` table on September 25, 2026. Do not run
a blanket `db push` there until the historical migrations have been baselined:
it could replay the initial schema migrations. The round-two hardening migration
was applied directly through the SQL editor in one transaction, after checking
the existing schema and normalizing two company website URLs to include HTTPS.
Its three triggers, four supporting tables, two customer columns and eleven
validated constraints were verified before code deployment.
The prerequisite `20260601_security_hardening.sql` was also found unapplied
and applied through the SQL editor, adding the user-field protection trigger
and removing the obsolete client-side conversation creation policies.

`20260925_security_hardening_2.sql` is required. Until it is applied:

- any employer can set `is_pro = true` on their own company with the anon key
  and unlock Pro features plus candidate CV downloads,
- any employer can publish a listing with `status = 'active'`, bypassing the
  approval queue,
- rate limiting fails open (the RPC does not exist, so every request is
  allowed) and the Stripe webhook cannot deduplicate retries.

The migration is idempotent and safe to re-run.

## Scheduled jobs

Vercel runs the following jobs. They authenticate
with `Authorization: Bearer $CRON_SECRET`.

| Job                | Schedule (UTC) | Route                        |
| ------------------ | -------------- | ---------------------------- |
| `expire-listings`  | hourly         | `/api/cron/expire-listings`  |
| `resume-nudge`     | 10:00 daily    | `/api/cron/resume-nudge`     |
| `signup-reminder`  | 11:00 daily    | `/api/cron/signup-reminder`  |

Vercel reads the schedules from `vercel.json`.

## Long-running routes

Bulk email routes export `maxDuration = 300`. Vercel honours this on Pro;
on Hobby the ceiling is lower, so `/api/admin/outreach` is chunked and
resumable: it processes at most 100 recipients per call and returns
`next_offset`, which the caller passes back until `complete` is true.

```bash
# Walk the whole list
OFFSET=0
while [ "$OFFSET" != "null" ]; do
  OFFSET=$(curl -s -X POST https://joblinkantigua.com/api/admin/outreach \
    -H 'content-type: application/json' \
    -d "{\"secret\":\"$OUTREACH_SECRET\",\"email\":1,\"offset\":$OFFSET}" \
    | jq -r '.next_offset')
done
```
