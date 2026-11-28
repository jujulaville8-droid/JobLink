import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const billingJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** State-changing requests must come from our own pages. */
export function sameOrigin(request: Request): boolean {
  const url = new URL(request.url)
  const host = request.headers.get('host') ?? url.host
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1)
  return ['http', 'https'].includes(protocol) && request.headers.get('origin') === `${protocol}://${host}`
}

/** A 403 unless the account is an employer. Role is read from the database, never the request. */
export async function employerOnly(db: SupabaseClient, userId: string): Promise<Response | null> {
  const { data } = await db.from('users').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'employer' ? null : billingJson({ error: 'Employer accounts only.' }, 403)
}
