# Deployment

Vercel is the intended target. Netlify config is still present and still
functional; it is kept only until the Vercel cutover is confirmed, because
deleting it while Netlify is the live host would silently stop all three cron
jobs.

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

```bash
supabase db push
```

`20260925_security_hardening_2.sql` is required. Until it is applied:

- any employer can set `is_pro = true` on their own company with the anon key
  and unlock Pro features plus candidate CV downloads,
- any employer can publish a listing with `status = 'active'`, bypassing the
  approval queue,
- rate limiting fails open (the RPC does not exist, so every request is
  allowed) and the Stripe webhook cannot deduplicate retries.

The migration is idempotent and safe to re-run.

## Scheduled jobs

Both hosts run the same three jobs. Whichever host is live, they authenticate
with `Authorization: Bearer $CRON_SECRET`.

| Job                | Schedule (UTC) | Route                        |
| ------------------ | -------------- | ---------------------------- |
| `expire-listings`  | hourly         | `/api/cron/expire-listings`  |
| `resume-nudge`     | 10:00 daily    | `/api/cron/resume-nudge`     |
| `signup-reminder`  | 11:00 daily    | `/api/cron/signup-reminder`  |

Vercel reads `vercel.json`; Netlify reads `netlify.toml` plus the wrappers in
`netlify/functions/`.

## Completing the Vercel cutover

Once `curl -sI` confirms Vercel is serving and the crons have fired there at
least once:

1. Delete `netlify.toml` and `netlify/functions/`.
2. Delete `docs/netlify-deployment.md`.
3. Remove the Netlify site, or at least unpublish it, so it cannot serve a
   stale build from an old branch.

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
