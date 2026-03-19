---
name: joblink-backend
description: Complete backend architecture reference for the JobLink project. Use when troubleshooting auth, email, password reset, Supabase, or any backend flow.
user-invocable: true
---

# JobLink Backend Architecture

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router) + TypeScript
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **Database:** Supabase Postgres with RLS
- **Email:** Resend (v6.9.3) via API route
- **Domain:** joblinkantigua.com

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
RESEND_API_KEY=[resend-api-key]
```

## Supabase Client Setup

There are THREE Supabase clients. Using the wrong one is the #1 source of bugs:

| Client | File | When to Use |
|--------|------|-------------|
| **Browser** | `src/lib/supabase/client.ts` | Client components, hooks, browser-side auth calls |
| **Server** | `src/lib/supabase/server.ts` | Server components, API routes (respects RLS) |
| **Admin** | `src/lib/supabase/admin.ts` | Server-only, bypasses RLS. Use for admin ops or syncing auth → public tables |

## Auth Architecture

### Dual Email Verification (IMPORTANT)
The system checks TWO places for verification:
1. `auth.users.email_confirmed_at` (Supabase managed)
2. `public.users.email_verified` (custom DB flag)

**Both must be TRUE.** If only one is set, the user gets stuck. This is the most common auth bug.

### Auth Helper Files
- `src/lib/auth.ts` → `getCurrentUser()`, `getUserRole()`, `requireAuth()`, `requireVerifiedAuth()`, `requireRole()`
- `src/lib/auth-verify.ts` → `isEmailConfirmedByAuth()`, `isEmailVerified()`, `canAccessApp()`, `getAuthStatus()`
- `src/lib/api-auth.ts` → `requireVerifiedUser()` for API routes

### Middleware
- `src/middleware.ts` → entry point
- `src/lib/supabase/middleware.ts` → session refresh, route protection, verification redirect

Middleware runs on EVERY request. It:
1. Refreshes the Supabase session
2. Checks if user is verified (both levels)
3. Redirects unverified users to `/verify-email`
4. Keeps session alive so unverified users can still resend

## Email Verification Flow
```
User Signs Up (email/password)
  → Supabase sends verification email (configured in Supabase Dashboard > Auth > Email Templates)
  → User clicks link → /auth/verify-confirm?token_hash=...&type=signup
  → src/app/auth/verify-confirm/page.tsx verifies token via supabase.auth.verifyOtp()
  → Syncs to public.users.email_verified = true
  → Redirects based on role: seeker→/jobs, employer→/post-job, admin→/dashboard
```

**If verification emails aren't sending:** Check Supabase Dashboard > Auth > Email Templates. Supabase handles sending these, NOT Resend.

**If user is stuck as unverified:** Check both `auth.users.email_confirmed_at` AND `public.users.email_verified`. Fix by running:
```sql
-- Check auth level
SELECT email_confirmed_at FROM auth.users WHERE email = 'user@example.com';
-- Check DB level
SELECT email_verified FROM public.users WHERE email = 'user@example.com';
-- Fix DB level if auth is confirmed but DB isn't
UPDATE public.users SET email_verified = true WHERE email = 'user@example.com';
```

**Google OAuth users** skip verification entirely. They are auto-verified in the `/auth/callback` handler.

## Forgot Password Flow
```
User clicks "Forgot Password" → /forgot-password
  → src/app/(auth)/forgot-password/page.tsx
  → Calls supabase.auth.resetPasswordForEmail(email, { redirectTo })
  → Supabase sends reset email (from Supabase Dashboard templates, NOT Resend)
  → User clicks link → /auth/callback/reset?token_hash=...&type=recovery
  → src/app/auth/callback/reset/page.tsx verifies token via supabase.auth.verifyOtp()
  → Redirects to /reset-password
  → src/app/(auth)/reset-password/page.tsx
  → Calls supabase.auth.updateUser({ password })
  → Redirects to dashboard/jobs based on role
```

**Common issues:**
- Reset emails not arriving: Check Supabase Dashboard > Auth > Email Templates > Reset Password
- Token expired: Supabase tokens expire after 1 hour by default
- "Invalid token" error: User may have clicked the link twice, or the redirect URL doesn't match what's configured in Supabase Dashboard > Auth > URL Configuration
- Make sure Site URL and Redirect URLs are set correctly in Supabase Dashboard

## Resend Email System (Application Emails)

Resend handles transactional emails AFTER auth (not auth emails themselves).

**API Route:** `src/app/api/send-email/route.ts`
**Helper:** `src/lib/email.ts` → `sendEmail({ to, type, data })`
**From:** `JobLinks <notifications@joblinkantigua.com>`

### Email Types Supported
| Type | Trigger | Recipient |
|------|---------|-----------|
| `application_confirmation` | User applies for job | Job seeker |
| `new_applicant` | Someone applies | Employer |
| `status_update` | Application status changes | Job seeker |
| `job_alert` | New jobs match saved alert | Job seeker |
| `listing_expiry` | Listing about to expire | Employer |
| `listing_approved` | Admin approves listing | Employer |
| `listing_rejected` | Admin rejects listing | Employer |
| `new_message` | New message received | Recipient |
| `report_response` | Admin responds to report | Reporter |

**Email is fire-and-forget.** It never throws. Failures are logged but don't break user flows.

### Messaging Notifications
`src/lib/messaging-notifications.ts` → `sendMessageNotification()`
- Respects `user_messaging_settings.email_notifications` preference
- Has a 5-minute cooldown per conversation to prevent spam
- Uses `notification_log` table for dedup

## Database Schema

**Master schema:** `schema-clean.sql`
**Migrations:** `supabase/migrations/`

### Core Tables
- `public.users` → extends auth.users (role, email_verified, is_banned, is_admin)
- `public.seeker_profiles` → job seeker details
- `public.companies` → employer company info
- `public.job_listings` → job postings (status: pending/approved/rejected/expired)
- `public.applications` → job applications (status enum with shortlisted/rejected/interview/hold)
- `public.conversations` → messaging threads
- `public.messages` → individual messages
- `public.user_messaging_settings` → notification preferences
- `public.notification_log` → email dedup tracking

### User Roles
Enum: `seeker`, `employer`
Admin is a separate boolean flag `is_admin` (not part of role enum).

## Auth Pages
| Page | Path | File |
|------|------|------|
| Seeker Login | `/login` | `src/app/(auth)/login/page.tsx` |
| Employer Login | `/employer/login` | `src/app/(auth)/employer/login/page.tsx` |
| Seeker Signup | `/signup` | `src/app/(auth)/signup/page.tsx` |
| Employer Signup | `/employer/signup` | `src/app/(auth)/employer/signup/page.tsx` |
| Forgot Password | `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` |
| Reset Password | `/reset-password` | `src/app/(auth)/reset-password/page.tsx` |
| Verify Email | `/verify-email` | `src/app/verify-email/page.tsx` |
| Verify Confirm | `/auth/verify-confirm` | `src/app/auth/verify-confirm/page.tsx` |
| Reset Confirm | `/auth/callback/reset` | `src/app/auth/callback/reset/page.tsx` |

## Troubleshooting Checklist

### Emails not sending (auth emails: verification, reset)
1. These come from Supabase, not Resend
2. Check Supabase Dashboard > Auth > Email Templates
3. Check Supabase Dashboard > Auth > URL Configuration (Site URL + Redirect URLs)
4. Check spam folder
5. On free tier, Supabase rate limits to 4 emails/hour

### Emails not sending (app emails: notifications, alerts)
1. Check RESEND_API_KEY is set
2. Check Resend dashboard for delivery logs
3. Domain `joblinkantigua.com` must be verified in Resend
4. Check `/api/send-email` route for errors in server logs

### User stuck after verification
1. Check both verification levels (see SQL above)
2. Check middleware isn't caching a stale session
3. Try hard refresh or clear cookies

### Password reset not working
1. Check Supabase redirect URLs include the reset callback path
2. Token expires after 1 hour
3. Link can only be used once
4. Check that `/auth/callback/reset` page properly calls verifyOtp with type: 'recovery'

### OAuth (Google) not working
1. Check Google OAuth credentials in Supabase Dashboard > Auth > Providers
2. Redirect URI in Google Console must match Supabase callback URL
3. OAuth users are auto-verified, no email step needed
