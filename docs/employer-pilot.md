# Employer hiring-help pilot

Public link: https://joblinkantigua.com/employers/hiring-help

The page explains a free first-vacancy pilot, provides a no-account request form and makes clear that publication follows a conversation and employer approval. It promises no applicant count, hire guarantee, deadline or automatic enrolment. Outreach and homepage employer links lead here. Approved, consented testimonials appear when available; no placeholders or invented success stories are used.

## Handling a request

1. Open **Admin → Employer Requests**. A notification also goes to the existing verified owner forwarding inbox (`TEAM_INBOX` in `src/lib/team-inbox.ts`), with Reply-To set to the submitted address. The form itself is the employer's contact consent; this is not a marketing subscription or permission to publish.
2. Contact the business. Confirm the vacancy is genuine and still open; agree location, duties, hours, pay, application method and requirements. Decide whether to accept the free pilot. Track contact attempts and agreed next steps in private notes.
3. Use **Prepare listing from this request**. Select the correct existing company or create one using the existing admin form. The title and raw advert are prefilled. Remove any private details, finish the description and obtain approval of the final text. The form requires you to confirm that approval before publishing.
4. After posting, copy the JobLinks job URL into the request and mark it **Listing live**. Tell the employer where it is published and agree how applications will be reviewed. The initial request does not publish a vacancy or message candidates automatically.
5. Follow up on applicants and hiring outcomes. For hires managed through an employer account, use **Confirm hire** to start the existing testimonial flow. Close the enquiry when the pilot is finished or declined.

## Delivery and reliability

Each form uses a random request ID retained across retries. Storage happens before notification; repeating an ID never creates another request. An on-page receipt confirms saved requests, not email delivery. A honeypot and shared, fail-closed hourly limits (5/IP and 3/email) protect the public endpoint. Rate-limit identifiers are hashed. Browser roles cannot read or write the intake table directly; only admin-checked server routes expose requests.

`/api/cron/employer-enquiries` retries pending notifications hourly, protected by `CRON_SECRET`. Stable Resend idempotency keys prevent duplicate messages within its deduplication window. Retries stop at 23 hours; the admin inbox shows delivery uncertainty for investigation in Resend. Do not reset timestamps or blindly resend. Requests remain in the inbox even if notification fails.

The public endpoint only emails the fixed JobLinks owner inbox, not arbitrary submitted addresses. No automatic acknowledgement email is sent to an unverified address. The receipt supplies a reference for follow-up requests.

Production testing found `hello@joblinkantigua.com` hard-bounces with “User does not exist” at the domain’s Zoho mail provider. Pilot notifications and both outreach senders’ Reply-To now use the existing verified owner forwarding inbox instead. This does not create or repair the missing Zoho mailbox; it must be provisioned there before being used as a contact address again.

## Deployment and validation

Apply only `supabase/migrations/20260929_employer_enquiries.sql` before deploying. Existing `RESEND_API_KEY`, `CRON_SECRET` and Supabase environment variables are reused. Do not push the entire historical migration directory to the manually managed production database.

Tests cover request validation, consent, rate-limit failure, duplicate submissions, storage failures, browser access denial, form retries and notification behavior. A production smoke request should be clearly labelled TEST, sent only to the internal inbox, and closed after verification.
