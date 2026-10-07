# Admin company contacts and applicant notifications

Admins can use `/admin/companies` to find a company, upload/replace/clear its logo,
and save or clear **Employer notification email**. The admin posting form also
saves this address for the selected company or a newly created company. This is
a company-wide recruitment inbox: use an address the employer has authorized to
receive applications. No address is extracted from a job description automatically.

Existing logo management from PR #22 is retained. New admin uploads are decoded,
limited to still PNG/JPEG/WebP images under 5 MB and 16 million pixels, resized to
256px, and re-encoded as PNG. They use unique paths inside
`company-logos/admin/<company-id>/`. Pasted URLs must be in the same project's
public `company-logos` bucket and this company's admin folder or owner's folder.
The server downloads pasted objects by their validated storage key and applies
the same byte validation/re-encoding before saving a new normalized admin logo.
Clearing/replacing a logo changes `companies.logo_url`; existing files and employer
self-serve uploads remain intact. Failed saves remove only the new upload.

## Delivery and privacy

After a verified seeker successfully submits an application, the server rechecks
the saved application's seeker, job, and company before resolving the recipient.
It uses a valid saved `companies.contact_email`, or a valid verified account-owner
email when the contact is null/cleared. Invalid nonempty contacts fail closed.
`admin-company-…@joblinkantigua.com` and legacy `import+…@joblinkantigua.com`
placeholders and banned owners/applicants
do not receive notifications. Recipient addresses and CV paths supplied in the
application request are ignored. The company contact is a business contact in the
existing publicly readable company table, not a secret credential.

The employer email contains the applicant's name, account email and profile phone
when available, and up to 1,500 characters of cover letter. Reply-To is the
applicant's valid account email. The CV is a PDF attachment containing private
bytes downloaded server-side from the applicant's own `cvs/<user-id>/` folder.
Same-project legacy storage URLs are normalized; other hosts, buckets, users,
traversal paths, non-PDF files and files over 5 MB are excluded. If there is no
upload, the applicant's saved JobLink resume is rendered privately using the
existing resume document. No public or signed CV URL is put in the email.

Only a recipient matching the real company owner's account email gets the
`/my-listings/<job-id>/applicants` review link. External employer contacts can
read the attachment and reply without signing into a placeholder account. If a
CV is absent/unavailable the email states that honestly and still includes contact
details. Attachments are private applicant information delivered to that authorized
inbox; recipients should treat them accordingly. No optional CC is enabled.

Provider acceptance is best-effort and uses an application-specific idempotency
key. Delivery failure does not undo a saved application. This change does not add
a durable retry queue. No provider key means no notification or private CV read.
Logs contain event descriptions, without recipient addresses, provider error
payloads or private resume paths/content.

## Reviewed rollout prerequisite

`supabase/migrations/20261005152749_company_contact_email.sql` is **unapplied**.
Earlier main code already read `contact_email`, but repository migration history
did not define it. Review the actual target schema/migration ledger and apply this
one migration through the normal reviewed process before release; do not replay
old migrations blindly. It preserves existing values and does no backfill.
Its trigger keeps notification routing admin-managed while preserving normal
employer profile edits. Invalid legacy contacts are preserved for review and
will not receive private applicant details until corrected.

Do not backfill Nobu or another live company from listing text as part of this PR.
The owner will upload actual logos after merge. Confirm the authorized recruitment
inbox and inspect delivery in staging with synthetic applicants and a controlled
mailbox before a reviewed production release. The in-app Apply flow remains the
primary application route; existing employer email instructions are unchanged.

Local verification uses fixtures, private PDF rendering and disposable PostgreSQL
(PGlite). It does not submit live applications, write live company/storage data,
send email, deploy production or run hosted migrations.
