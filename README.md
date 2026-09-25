# JobLinks

The job board for Antigua and Barbuda. Job seekers browse and apply, build a
resume, and message employers; employers post listings, review applicants, and
upgrade to Pro for candidate access and priority placement.

Built with Next.js 16 (App Router), Supabase (Postgres, Auth, Storage), Stripe
and Resend.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at http://localhost:3000.

Every variable in `.env.example` is required for a full local run. The app
starts without the Stripe and Resend values, but checkout and email will fail.

## Scripts

| Command                  | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `npm run dev`            | Development server                                       |
| `npm run build`          | Production build                                         |
| `npm run start`          | Serve a production build                                 |
| `npm run lint`           | ESLint                                                   |
| `npm run typecheck`      | `tsc --noEmit`                                           |
| `npm run test:unit`      | Vitest component and unit specs                          |
| `npm run test:node`      | Node test runner: navigation, database security invariants |
| `npm run test`           | Typecheck, lint, and both test suites                    |
| `npm run smoke`          | Local smoke check against a running dev server           |

## Database

Migrations live in `supabase/migrations/` and are applied in filename order.
`schema-clean.sql` is a flattened snapshot of the base schema, used by the
tests rather than for deployment.

Apply migrations before deploying code that depends on them:

```bash
supabase db push
```

Two migrations carry security guarantees the application cannot enforce on its
own, because `companies` and `job_listings` are written directly from the
browser with the anon key:

- `20260601_security_hardening.sql` — privileged fields on `public.users` are
  service-role only.
- `20260925_security_hardening_2.sql` — the same for company billing fields
  (`is_pro`, `is_verified`, `pro_expires_at`), listing moderation
  (`status`, `is_featured`), the free-tier listing cap, candidate-data access,
  input length limits, and the rate-limit and Stripe-idempotency tables.

`tests/security-hardening.test.mjs` loads both into an in-memory Postgres and
asserts the invariants hold, so a future migration cannot quietly undo them.

## Deployment

Vercel is the deployment target; `vercel.json` defines the three cron jobs.
`netlify.toml` and `netlify/functions/` mirror the same schedule and are kept
only until the Vercel cutover is confirmed — see `docs/deployment.md`.

## Architecture notes

- `src/lib/api-auth.ts` — `requireUser`, `requireVerifiedUser` and
  `requireAdmin`. Every route that writes uses `requireVerifiedUser`; admin
  accounts are exempt from the email-verification requirement so server-side
  automation is not gated on an inbox.
- `src/lib/rate-limit.ts` — Postgres-backed fixed-window limiting. Fails open.
- `src/lib/safe-sql.ts` — escaping for JSON-LD output and PostgREST filter
  expressions.
- `src/proxy.ts` — Next.js 16's renamed middleware. Refreshes the Supabase
  session, redirects unverified users, and blocks banned accounts.
