import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const parsed = z.object({ company_id: z.uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid company.' }, { status: 400 })

  const token = randomBytes(32).toString('base64url')
  const { data, error } = await createAdminClient().rpc('create_company_claim', {
    p_company_id: parsed.data.company_id, p_admin_id: auth.user.id, p_token: token,
  })
  if (error) {
    const ineligible = error.message === 'COMPANY_NOT_CLAIMABLE'
    return NextResponse.json({ error: ineligible ? 'Only unclaimed companies created by JobLink can receive a claim link.' : 'Could not create a claim link. Please try again.' }, { status: ineligible ? 409 : 500 })
  }
  const created = Array.isArray(data) ? data[0] : data
  if (!created?.expires_at) return NextResponse.json({ error: 'Could not create a claim link. Please try again.' }, { status: 500 })
  return NextResponse.json({ url: `https://joblinkantigua.com/claim/${token}`, expires_at: created.expires_at }, { headers: { 'Cache-Control': 'no-store' } })
}
