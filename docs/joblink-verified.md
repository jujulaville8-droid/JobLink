# JobLink Verified

A job seeker pays a one-off EC$40 verification fee, has their police record and
right to work checked once, and can send both with any application for 6 months.
Applying stays free. Verified ships **switched off**.

## What is where

| Part | Location |
| --- | --- |
| Shared rules and wording (badge text, groups, reasons, dates) | `src/lib/verification/shared.ts` |
| Switches, auth, audit log, owner alerts | `src/lib/verification/server.ts` |
| Encryption (AES-256-GCM, versioned key) | `src/lib/verification/crypto.ts` |
| File checks, cleaning, private storage | `src/lib/verification/files.ts` |
| Stamp and right-to-work confirmation | `src/lib/verification/stamp.ts` |
| Checkout, webhook branch, refunds | `src/lib/verification/payment.ts` |
| Reviewer decisions | `src/lib/verification/review.ts` |
| Shares, badges | `src/lib/verification/sharing.ts` |
| Routes | `src/app/api/verification/**`, `src/app/api/admin/verifications/**`, `src/app/api/cron/verification-expiry` |
| Pages | `/verified`, `/verified/check/[code]`, `/guides/police-record`, `/verification`, `/admin/verifications`, `/two-step` |
| Database | `supabase/migrations/20261113090000_security_hardening_4.sql`, `20261113100000_seeker_verifications.sql` |
| Tests | `tests/verification-db.test.mjs`, `tests/verification-files.spec.tsx`, `tests/verification-api.spec.tsx`, `tests/admin-two-step.spec.tsx` |

## Switching on, in order

1. **Now, independent of Verified**
   - Apply `20261113090000_security_hardening_4.sql`.
   - Each admin signs in and enrols at `/two-step`. Then set `ADMIN_MFA_ENFORCED=true`.
   - Supabase dashboard, Authentication: turn on leaked-password protection (needs the Pro plan).
2. **Before any page is shown**
   - Labour Department and lawyer checks from the launch plan.
   - Confirm the facts on `/guides/police-record` (fee, hours, what to bring) with the Criminal Records Office.
   - Apply `20261113100000_seeker_verifications.sql`.
   - Stripe: product "JobLink Verified, 6 months", one-time price XCD 40.00. Put its id in `VERIFICATION_PRICE_ID`.
   - Generate the file key privately (`openssl rand -base64 32`) and enter it in Vercel as `VERIFICATION_FILE_KEY`. Keep a copy somewhere safe: without it stored police records cannot be read.
   - Check `CRON_SECRET` and `NTFY_SIGNUP_TOPIC` are set in Vercel.
3. `VERIFICATION_ENABLED=true` with checkout off. Check the pages.
4. Full run by hand in Stripe test mode with fake documents (test plan in the build plan).
5. `VERIFICATION_CHECKOUT_ENABLED=true` for the soft launch.
6. On the first payment (phone alert): upgrade Supabase to Pro, accept its data processing agreement, tick the box and press **Open uploads** in `/admin/verifications`. Everyone waiting is emailed.

## Rules the code keeps

- Browsers never write a verification record or touch the private folder; the database refuses both.
- A check only moves along the allowed status path, and each move is logged.
- The ID image is deleted at the decision. The police record is deleted when the badge ends, when the job seeker deletes it, or with the account.
- No column or field holds what a police record says. Reasons are codes from a fixed list.
- An employer can open documents only for an application to their own job, while sharing is on and the badge is valid. Every other case is the same 404.
- No email carries a document. No storage link is ever handed out.

## Not built yet

- A second way to pay for people without a bank card (still an open decision).
- The employer-screening outbox email (off in production) does not carry the badge line; the standard new-applicant email does.
- Refunds or disputes made directly in the Stripe dashboard are not synced back to the verification record.
