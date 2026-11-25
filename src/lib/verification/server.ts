import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, type RateLimitRule } from '@/lib/rate-limit'
import { fileKeyReady } from './crypto'
import { badgeIsValid, type VerificationStatus } from './shared'

/**
 * Switches. Verified ships switched off:
 *   VERIFICATION_ENABLED               shows Verified anywhere on the site
 *   verification_settings.uploads_open (database) opened from the admin page
 * It is free: there is no payment and no price.
 */
export const verificationEnabled = (): boolean => process.env.VERIFICATION_ENABLED === 'true'
/** New uploads need the file encryption key too. */
export const verificationUploadsReady = (): boolean => verificationEnabled() && fileKeyReady()

export const verificationJson = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })

/** One answer for "not yours", "not shared", "expired" and "does not exist". */
export const verificationNotFound = () => verificationJson({ error: 'Not found' }, 404)

export const VerificationLimits = {
  read: { limit: 240, windowSeconds: 3600 },
  upload: { limit: 12, windowSeconds: 3600 },
  manage: { limit: 30, windowSeconds: 3600 },
  /** Opening a document, per person. */
  document: { limit: 60, windowSeconds: 3600 },
  admin: { limit: 600, windowSeconds: 3600 },
  adminDecision: { limit: 120, windowSeconds: 3600 },
  /** Public code lookups, per IP address. */
  publicCheck: { limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>

export const verificationLimit = (name: keyof typeof VerificationLimits, subject: string) =>
  enforceRateLimit(`verification:${name}:${subject}`, VerificationLimits[name])

/** State-changing requests must come from our own pages. */
export function sameOrigin(request: Request): boolean {
  const url = new URL(request.url)
  const host = request.headers.get('host') ?? url.host
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1)
  return ['http', 'https'].includes(protocol) && request.headers.get('origin') === `${protocol}://${host}`
}

export interface VerificationRow {
  id: string
  seeker_id: string
  user_id: string
  status: VerificationStatus
  consent_at: string | null
  consent_version: string | null
  rtw_group_claimed: string | null
  rtw_group: string | null
  rtw_document_type: string | null
  rtw_document_expires_on: string | null
  rtw_file_path: string | null
  rtw_file_sha256: string | null
  key_version: number | null
  verified_until: string | null
  confirmation_code: string | null
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  decision_reason: string | null
  expiry_reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

export interface SeekerContext {
  user: User
  /** Service-role client. Every caller has already been authorised. */
  db: SupabaseClient
  profile: { id: string; first_name: string | null; last_name: string | null }
}

/**
 * A signed-in, email-verified job seeker with a profile.
 * Nothing trusts the browser to say who someone is: the user comes from the
 * session, the role and profile from the database.
 */
export async function verificationSeeker(): Promise<SeekerContext | { error: Response }> {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth
  const db = createAdminClient()
  const [account, profile] = await Promise.all([
    db.from('users').select('role').eq('id', auth.user.id).maybeSingle(),
    db.from('seeker_profiles').select('id, first_name, last_name').eq('user_id', auth.user.id).maybeSingle(),
  ])
  if (account.error || profile.error) return { error: verificationJson({ error: 'Could not load your account. Try again.' }, 503) }
  if (account.data?.role !== 'seeker') return { error: verificationJson({ error: 'Verified is for job seeker accounts.', code: 'SEEKER_REQUIRED' }, 403) }
  if (!profile.data) return { error: verificationJson({ error: 'Finish your profile first.', code: 'PROFILE_REQUIRED' }, 409) }
  return { user: auth.user, db, profile: profile.data }
}

const OPEN: VerificationStatus[] = ['draft', 'submitted', 'reupload_needed']

export interface SeekerVerifications {
  /** The check in progress, if any. */
  open: VerificationRow | null
  /** The approved check, whether or not it is still in date. */
  badge: VerificationRow | null
  /** The most recent finished check, for showing a refund or expiry notice. */
  last: VerificationRow | null
}

export async function loadVerifications(db: SupabaseClient, userId: string): Promise<SeekerVerifications> {
  const { data, error } = await db.from('seeker_verifications').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error('Could not load verification')
  const rows = (data ?? []) as VerificationRow[]
  return {
    open: rows.find((row) => OPEN.includes(row.status)) ?? null,
    badge: rows.find((row) => row.status === 'approved') ?? null,
    last: rows.find((row) => ['not_approved', 'expired', 'withdrawn'].includes(row.status)) ?? null,
  }
}

/** The job seeker's approved, in-date check, or null. */
export async function validBadge(db: SupabaseClient, seekerId: string): Promise<VerificationRow | null> {
  const { data, error } = await db.from('seeker_verifications').select('*')
    .eq('seeker_id', seekerId).eq('status', 'approved').maybeSingle()
  if (error) throw new Error('Could not load verification')
  return badgeIsValid(data) ? (data as VerificationRow) : null
}

export async function uploadsOpen(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from('verification_settings').select('uploads_open').maybeSingle()
  if (error) throw new Error('Could not load verification settings')
  return data?.uploads_open === true
}

export interface AuditEvent {
  verification_id: string
  actor_id: string | null
  actor_role: 'seeker' | 'admin' | 'employer' | 'system'
  event: 'uploaded' | 'file_opened_by_reviewer' | 'file_deleted' | 'confirmation_opened_by_employer' | 'sharing_stopped' | 'reminder_sent'
}

/**
 * Write to the audit log. Throws on failure: a document is never handed over,
 * and a deletion never reported, without its log line.
 */
export async function logVerificationEvent(db: SupabaseClient, event: AuditEvent | AuditEvent[]): Promise<void> {
  const { error } = await db.from('verification_events').insert(event)
  if (error) throw new Error('Audit log unavailable')
}

/**
 * Phone alert to the owner through the same ntfy channel as signup alerts.
 * The topic is a bearer secret; messages are generic and carry no personal data.
 */
export async function ownerAlert(title: string, message: string): Promise<void> {
  if (process.env.VERCEL_ENV !== 'production') return
  const topic = process.env.NTFY_SIGNUP_TOPIC
  if (!topic || !/^[A-Za-z0-9_-]{32,64}$/.test(topic)) return
  try {
    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: title, Priority: 'high' },
      body: message,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) console.error('[verification-alert] Provider rejected notification', { status: response.status })
  } catch {
    // Never log raw fetch errors: they can contain the bearer topic URL.
    console.error('[verification-alert] Notification delivery uncertain')
  }
}

export const seekerEmail = async (db: SupabaseClient, userId: string): Promise<string | null> => {
  const { data } = await db.from('users').select('email').eq('id', userId).maybeSingle()
  return typeof data?.email === 'string' && data.email ? data.email : null
}
