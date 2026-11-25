# JobLink Verified (free right-to-work check)

A job seeker uploads one right-to-work document. A JobLink reviewer checks it is
genuine, current and theirs. Employers then see a badge on that person's
applications, and can open a one-page confirmation when the job seeker chooses
to send it. It is **free** and optional, and no police record is involved.

| | |
| --- | --- |
| Badge | "Verified eligible to work in Antigua" (citizens, permanent residents, OECS citizens and spouses, CARICOM Skills Certificate holders) |
| Permit holders | "Verified: holds an Antigua work permit" (a permit is tied to one employer and position) |
| Lasts | Until the document checked expires, at most two years. Reminder 30 days before; renewing is free. |
| Kept | The group, the type of document, its expiry date and when it was checked. The image is deleted at the decision. |
| Employer sees | The badge, and (only when the job seeker ticks "Send my right-to-work confirmation") a confirmation with name, status, document type, date and a verification code. Never an ID number or photo. |

## What is where

| Part | Location |
| --- | --- |
| Rules and wording | `src/lib/verification/shared.ts` |
| Switch, auth, audit log | `src/lib/verification/server.ts` |
| Encryption and file checks (image held only until the decision) | `src/lib/verification/crypto.ts`, `files.ts` |
| Confirmation document | `src/lib/verification/stamp.ts` |
| Review decisions | `src/lib/verification/review.ts` |
| Routes | `src/app/api/verification/**`, `src/app/api/admin/verifications/**`, `src/app/api/cron/verification-expiry` |
| Pages | `/verified`, `/verified/check/[code]`, `/verification`, `/admin/verifications`, `/two-step` |
| Database | `supabase/migrations/20261113100000_seeker_verifications.sql` |

## Switching on

1. Confirm the accepted documents with the Labour Department.
2. Apply `20261113090000_security_hardening_4.sql` and `20261113100000_seeker_verifications.sql`.
3. Generate the file key privately (`openssl rand -base64 32`) and set it in Vercel as `VERIFICATION_FILE_KEY`.
4. Set `VERIFICATION_ENABLED=true`. The pages appear; uploads stay closed.
5. Each admin who reviews enrols in two-step login at `/two-step`.
6. In `/admin/verifications`, tick the confirmation and press **Open uploads**.
