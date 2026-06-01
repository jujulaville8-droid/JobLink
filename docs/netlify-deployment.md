# Netlify Deployment

## Required environment variables

Add every variable listed in `.env.example` under **Project configuration > Environment variables**.

`RESEND_WEBHOOK_SECRET` is not the Resend API key. Copy the signing secret from the
Resend webhook that targets:

```text
https://joblinkantigua.com/api/webhooks/resend-inbound
```

The value cannot be generated from this repository.

## Database migration

Apply the Supabase migrations before publishing the Netlify deploy. The
`20260601_security_hardening.sql` migration prevents browser clients from editing
privileged user fields or manufacturing arbitrary messaging threads.

## Scheduled functions

`netlify.toml` schedules three Netlify functions:

| Function | Schedule (UTC) |
| --- | --- |
| `expire-listings` | Hourly |
| `resume-nudge` | Daily at 10:00 |
| `signup-reminder` | Daily at 11:00 |

Each function calls its protected application endpoint with `CRON_SECRET`.
