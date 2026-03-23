import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error

  const { user } = auth

  const admin = createAdminClient()

  // Verify admin
  const { data: userData } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data: companies, error } = await admin
    .from('companies')
    .select('id, company_name, industry, location')
    .order('company_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ companies: companies || [] })
}
