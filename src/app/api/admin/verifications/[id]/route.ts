import { z } from 'zod'
import { requireAdminTwoStep } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { DecisionRefused, decideVerification, decisionSchema, reviewView } from '@/lib/verification/review'
import {
  sameOrigin, verificationEnabled, verificationJson, verificationLimit, verificationNotFound, type VerificationRow,
} from '@/lib/verification/server'

export const maxDuration = 60

async function load(id: string) {
  const db = createAdminClient()
  const found = await db.from('seeker_verifications').select('*, seeker_profiles(first_name, last_name)').eq('id', id).maybeSingle()
  if (found.error) throw new Error('load failed')
  return { db, row: found.data as (VerificationRow & { seeker_profiles: { first_name: string | null; last_name: string | null } | null }) | null }
}

/** Review detail. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  const auth = await requireAdminTwoStep()
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return verificationNotFound()
  const limited = await verificationLimit('admin', auth.user.id)
  if (limited) return limited
  try {
    const { row } = await load(id)
    if (!row) return verificationNotFound()
    return verificationJson({ verification: reviewView(row, row.seeker_profiles) })
  } catch {
    return verificationJson({ error: 'Could not load this verification.' }, 503)
  }
}

/** Approve, ask for a re-upload, or not approve with a refund. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const auth = await requireAdminTwoStep()
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return verificationNotFound()
  const limited = await verificationLimit('adminDecision', auth.user.id)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { return verificationJson({ error: 'Invalid request.' }, 400) }
  const decision = decisionSchema.safeParse(body)
  if (!decision.success) return verificationJson({ error: decision.error.issues[0]?.message || 'Check the form and try again.' }, 400)

  try {
    const { db, row } = await load(id)
    if (!row) return verificationNotFound()
    const result = await decideVerification(db, row, auth.user.id, decision.data)
    return verificationJson({ success: true, ...result })
  } catch (error) {
    if (error instanceof DecisionRefused) return verificationJson({ error: error.message }, 409)
    console.error('[verification-review] Decision failed')
    return verificationJson({ error: 'The decision was not saved. Nothing was sent to the job seeker. Try again.' }, 503)
  }
}
