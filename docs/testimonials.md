# Placement testimonials

Employers confirm an agreed hire from **My Listings → Applicants → Confirm hire**. This creates one placement per application and optionally closes the listing. Application workflow statuses remain separate; putting an applicant on hold does not imply a hire.

The placement queues one optional feedback request to the employer's account email. The request starts immediately after confirmation; `/api/cron/testimonials` retries hourly using `CRON_SECRET`. Resend receives a stable idempotency key and a frozen recipient and message. Uncertain retries stop after 23 hours, before Resend's 24-hour deduplication window expires. Admin → Hiring Stories shows delivery uncertainty for manual investigation in Resend. Do not reset that timestamp or resend blindly.

The email links to `/placement-feedback/{id}`. The employer signs in, rates the experience, submits 10–600 characters, and optionally permits company/job attribution on the website and in outreach. No candidate data is requested. Employers can revisit the link or applicant list to edit their feedback or withdraw permission; saving removes any previous approval. This stops future reuse but cannot recall previously delivered emails.

Admins review the original quote and automatically generated excerpt at `/admin/testimonials`. Only feedback rated 4 or 5 with explicit sharing permission can be approved. Review includes checking for personal information. Snippets are exact quotes, truncated at a word boundary when necessary; no invented metrics or AI paraphrasing. The latest six approved stories are eligible for rotation. The public `/success-stories` page shows their full quotes.

Both `/api/send-outreach` and `/api/admin/outreach` fetch current approved stories when constructing an email. No story is added when the pool is empty. This feature does not launch an outreach campaign or send requests for historical on-hold applications.

## Deployment

Apply only `supabase/migrations/20260928_placement_testimonials.sql` before deploying the routes. The production database has a manually managed migration history; do not push all historical migrations. The new table has owner-only read access and server-only writes, and the confirmation function is service-role-only. Existing `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` are required.

## Verification

`npm test` includes database tests for ownership, duplicate confirmation, browser permission boundaries, approval constraints and withdrawal; delivery tests cover claims, retries, idempotency and approved-story selection. No real email is sent by those tests.
