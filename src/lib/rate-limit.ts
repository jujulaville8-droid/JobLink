import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fixed-window rate limiting backed by the `consume_rate_limit` Postgres
 * function (see supabase/migrations/20260925_security_hardening_2.sql).
 *
 * Serverless instances do not share memory, so an in-process counter would
 * only limit whichever instance happened to receive the request. The counter
 * lives in Postgres, incremented by a single statement so concurrent callers
 * serialise on the row instead of racing between a read and a write.
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

/** Shared budgets, named so call sites read clearly. */
export const RateLimits = {
  /** Job applications: generous for a real job hunt, hostile to scripts. */
  apply: { limit: 20, windowSeconds: 3600 },
  /** Abuse reports: a real user files very few. */
  report: { limit: 10, windowSeconds: 3600 },
  /** Chat messages. */
  message: { limit: 60, windowSeconds: 3600 },
  /** Starting new conversations, which notifies a stranger by email. */
  conversation: { limit: 20, windowSeconds: 3600 },
  /** Profile and CV writes: autosave-friendly. */
  profileWrite: { limit: 120, windowSeconds: 3600 },
  /** Saving and unsaving jobs. */
  saveJob: { limit: 100, windowSeconds: 3600 },
  /** Job alert creation. */
  alert: { limit: 20, windowSeconds: 3600 },
  /** Role switching: a real user does this rarely. */
  roleSwitch: { limit: 10, windowSeconds: 3600 },
  /** Checkout session creation. */
  checkout: { limit: 10, windowSeconds: 3600 },
  /** Bulk outreach and admin email blasts. */
  bulkEmail: { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Consume one unit from `bucket`.
 *
 * Fails open: if the limiter itself errors (misconfigured service key, the
 * migration not yet applied, a database blip) the request is allowed through
 * and the failure is logged. A broken limiter should not take the site down.
 */
export async function consumeRateLimit(
  bucket: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })

    if (error) {
      console.error('[rate-limit] RPC failed, allowing request:', error.message)
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 }
    }

    return {
      allowed: row.allowed === true,
      remaining: Number(row.remaining ?? 0),
      retryAfterSeconds: Number(row.retry_after_seconds ?? rule.windowSeconds),
    }
  } catch (err) {
    console.error('[rate-limit] Unexpected failure, allowing request:', err)
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 }
  }
}

/**
 * Rate limit a route and get back a ready-to-return 429, or null to continue.
 *
 *   const limited = await enforceRateLimit(`apply:${user.id}`, RateLimits.apply)
 *   if (limited) return limited
 */
export async function enforceRateLimit(
  bucket: string,
  rule: RateLimitRule
): Promise<NextResponse | null> {
  const result = await consumeRateLimit(bucket, rule)
  if (result.allowed) return null

  return NextResponse.json(
    {
      error: 'Too many requests. Please slow down and try again shortly.',
      code: 'RATE_LIMITED',
      retry_after_seconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(rule.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

/**
 * Best-effort client IP for limiting endpoints that are reachable without a
 * session. Trusts the hosting provider's forwarding headers, which is correct
 * on Vercel and Netlify because both overwrite them at the edge.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
