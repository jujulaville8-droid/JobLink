# Employer pricing: Job Spotlight and Employer Pro

Built from the employer pricing and rollout proposal of 22 November 2026.
Everything ships **switched off**: no employer sees a change until
`EMPLOYER_BILLING_ENABLED=true`, and the candidate directory stays open to every
employer until it is restricted from the admin page.

| Offer | Price | What the employer gets |
| --- | --- | --- |
| Job board | Free | Post, receive applications, review and contact own applicants |
| Job Spotlight | EC$125 once | One vacancy featured for 7 days (168 hours from go-live), one Facebook post, one Instagram post, links and screenshots emailed, results at day seven |
| Employer Pro | EC$200 a month | Search and invite discoverable candidates, plus one Spotlight credit per settled month (expires with that month, no rollover) |

## Decisions built in

- Directory: Pro only once restricted, with notice to existing employers first. Own applicants always stay visible.
- Existing Pro (one company, a manual grant, no Stripe subscription): keeps Pro access; with pricing on, its listings are no longer all featured.
- Operating terms as proposed: 7 days from go-live, no credit rollover, one approved mid-campaign edit, the EC$125-to-Pro upgrade credit not active.

## What is where

| Part | Location |
| --- | --- |
| Data model, rules and atomic operations | `supabase/migrations/20261125090000_employer_billing.sql` |
| Switches and Stripe IDs | `src/lib/employer-billing/config.ts` |
| The one Pro check, directory gate | `src/lib/employer-billing/entitlement.ts` |
| Start page and claim matching | `src/lib/employer-billing/orders.ts`, `src/app/api/employer/billing/*` |
| Webhook branch | `src/lib/employer-billing/webhook.ts` (called from `src/app/api/webhooks/stripe/route.ts` before the legacy flow) |
| Campaign lifecycle, emails, schedule | `src/lib/employer-billing/campaigns.ts`, `src/app/api/cron/spotlight` (every 15 minutes) |
| Employer page | `/billing`; Spotlight button on My Listings |
| Admin queue | `/admin/employer-billing` |
| Tests | `tests/employer-billing-db.test.mjs`, `tests/employer-billing-webhook.spec.tsx`, `tests/employer-billing-api.spec.tsx`, `tests/employer-entitlement.spec.tsx` |

## How a payment becomes a benefit

1. The employer presses Buy on `/billing`. JobLink records an order for their company (and vacancy) and sends them to the issued Payment Link with `client_reference_id` set to the order's random reference.
2. The webhook recognises the offer by **price** (the link alone is not trusted), checks amount, currency (XCD), mode and settled status, and applies the event in one database transaction:
   - Spotlight paid: the order becomes paid and one credit is issued.
   - Pro checkout: the subscription is bound to the company. Access and the monthly credit come only from `invoice.paid` for a billing month (`subscription_create` or `subscription_cycle`, exactly EC$200).
   - Events can arrive in any order and any number of times: one order, one billing month, one credit.
3. A payment without a known reference becomes an **unassigned** order. The employer can add it from `/billing` when the Stripe receipt email is their verified account email; otherwise staff match it in the admin queue.
4. A Spotlight is booked by spending a credit on a live vacancy the company owns (one locked step). Staff confirm details, prepare the posts, press **Go live** (the listing is featured for 168 hours), save the three links and screenshots, and email the proof. The schedule ends it at 168 hours, or when the vacancy closes, and emails the results.
5. Cancelling at period end keeps access to the paid-through date. A failed renewal issues nothing. A full refund of a Pro month ends that month's access. Any refund or dispute freezes unspent credits and flags delivered campaigns for review.

## Switching on, in order

1. Apply `20261125090000_employer_billing.sql` (after the Verified and hardening migrations).
2. In a Stripe **sandbox**, create the same two prices and Payment Links (EC$125 one-time, EC$200 monthly). For each Payment Link set "After payment" to redirect to `https://joblinkantigua.com/billing?paid=1`.
3. Add these events to the existing webhook endpoint (`/api/webhooks/stripe`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.
4. Turn on Stripe's customer billing portal (cancel and update card).
5. Set the sandbox IDs in a preview deployment with `EMPLOYER_BILLING_LIVEMODE=false` and `EMPLOYER_BILLING_ENABLED=true`. Run the rehearsal: a one-time payment, a first subscription invoice, a renewal (Stripe test clock), a cancellation, a refund, a shared-link payment and its claim, and one full Spotlight from booking to the results email.
6. Production: set the live IDs (below) with `EMPLOYER_BILLING_LIVEMODE=true`, then `EMPLOYER_BILLING_ENABLED=true`. Spotlight sales and Pro sign-ups open; the directory is still open to everyone.
7. Tell existing employers. Then restrict the directory from Admin > Employer billing > Directory and credits (it asks you to confirm notice was sent).

Live Stripe objects from the proposal:

| | Spotlight | Employer Pro |
| --- | --- | --- |
| Payment Link ID | `plink_1UeUHuCucQcu2n8C6OXfOWYz` | `plink_1UeUI3CucQcu2n8CrzzGoCV9` |
| Price ID | `price_1UeUHuCucQcu2n8CPYlFsOL5` | `price_1UeUI3CucQcu2n8CL9AIuevs` |

The Payment Link URLs (`https://buy.stripe.com/...`) are in the Stripe dashboard; they go in `EMPLOYER_SPOTLIGHT_LINK_URL` and `EMPLOYER_PRO_LINK_URL`.

## Not built

- Automated repeat outreach to employers (the proposal keeps it manual for the ten-employer pilot).
- The optional EC$125-to-Pro upgrade credit (not active, as agreed).
- Moving job pages onto the Phase B public views: `job_listings.spotlight_until` will need adding to `job_listings_public` when that happens.
