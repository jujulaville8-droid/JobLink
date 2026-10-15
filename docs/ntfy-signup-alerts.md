# Free ntfy signup alerts

Signup completion means the first verified account, for a jobseeker or employer.
The password verification route, Google callback and protected-page repair share the existing
`public.users.email_verified` synchronization. A filtered Postgres update
(`id = authenticated user` and `email_verified = false`) returns a row to only
one callback. Routes schedule a notification with Next.js `after()`; the proxy
uses `NextFetchEvent.waitUntil()` so publication does not block navigation.
A recovered missing user row uses the existing primary key to handle competing
callbacks. Normal later login, profile saves and role switches do not alert.

There are no database migrations, new grants, Supabase webhooks, signup page
changes or native app changes. Existing authenticated server routes remain the
only entry points. Notification failures do not change verification responses.

## Payload and exclusions

The message is either `1 new jobseeker account verified on JobLink.` or
`1 new employer account verified on JobLink.` Names, addresses, phone numbers,
user IDs, CVs, links to user records and attachments are never sent to ntfy.
The destination is fixed to `https://ntfy.sh/` plus a server-only topic.

Only email/Google accounts created on or after activation are eligible. Both
the Auth creation time and public account creation time must pass the cutoff.
Unverified, banned and server-managed admin accounts are excluded. Existing
admin company placeholders (`admin_created` or `admin-company-` email prefix)
and accounts marked `imported`, `import_source` or `source: import` in Auth
metadata are excluded. Future import paths must retain an import marker;
an arbitrary unmarked admin-created account cannot be distinguished reliably
from self-service signup by these routes alone.

## Secure production setup

Julian chose the free hosted option after being told its topic is not protected
by an account. Anyone who obtains the topic can read or publish on it. Treat the
topic as a bearer secret, even though messages contain only a role and count.
Do not put it in source, chat, logs, URLs shared with others or `NEXT_PUBLIC_`
variables. No paid subscription or publisher token is required.

After action-time approval for secret/persistent-access setup:

1. Generate a private random topic with at least 32 URL-safe characters, up to
   64 characters. For example, use a password manager to generate a 40-character
   random alphanumeric password. Do not use this document's words as the topic.
2. In Vercel project `job-link`, add `NTFY_SIGNUP_TOPIC` as a Secret scoped only
   to Production. Julian should enter it directly in the secure field.
3. Set Production `NTFY_SIGNUP_ALERTS_SINCE` to the activation time in UTC ISO
   form, e.g. the actual current timestamp ending in `Z`. Do not use an example
   timestamp: accounts created earlier are intentionally excluded.
4. Set Production `NTFY_SIGNUP_ALERTS_ENABLED=true`. Leave Preview/Development
   unconfigured; the code also requires `VERCEL_ENV=production`.
5. In the ntfy iPhone app, allow notifications and subscribe using server
   `https://ntfy.sh` and the same topic. No JobLink App Store release is needed.
6. Release the reviewed code/redeploy so the production deployment includes
   these environment values. Environment edits alone do not update an existing
   deployment.
7. With explicit permission, publish one clearly labelled generic setup test
   to the configured topic. Record provider acknowledgement separately from
   Julian's confirmation of receipt on his phone. Do not create a real test
   signup or replay historical signups.

Missing, disabled or invalid configuration keeps notification publication off.
The topic must match `[A-Za-z0-9_-]{32,64}` and the cutoff must be a UTC ISO time.

## Delivery limits and deduplication

This is a best-effort, one-attempt alert tied to the first verification
transition. The request runs after the signup response with a five-second
timeout, refuses redirects and sends only a fixed small text payload. Logs
contain only a constant outcome and optional HTTP status, never the topic or
raw error. Provider acknowledgement does not prove phone receipt.

There is no outbox or automatic retry: a crash between verification and
publication, network error, timeout, quota exhaustion or provider rejection can
lose an alert. The signup remains verified. Ambiguous results are not retried
because doing so could duplicate a push. A deliberate administrative reset of
`email_verified` can create another verification transition for a recent
account; this mechanism is not an immutable lifetime notification ledger.
Normal repeated callbacks and concurrent requests have one attempt.

Free hosted quotas and iOS delivery are best effort. Do not promise instant
delivery or a notification for every account. To pause, set the enabled flag
to `false` and redeploy. To replace a compromised topic, privately enter a new
one, update the phone subscription and redeploy after approval.

## Verification

`tests/signup-notifications.spec.tsx` exercises the real password/OAuth routes
against a stateful database boundary double and an intercepted HTTP publisher.
It covers first verification, proxy repair, competing repair/callback paths,
concurrency, both roles, excluded accounts,
activation cutoff, missing/unsafe configuration, preview isolation, database
failure, invalid acknowledgements and provider/network failures. No real ntfy
request, email or signup is made by these tests.

Official references: [Publishing](https://docs.ntfy.sh/publish/),
[iPhone subscription](https://docs.ntfy.sh/subscribe/phone/),
[Known issues](https://docs.ntfy.sh/known-issues/).
