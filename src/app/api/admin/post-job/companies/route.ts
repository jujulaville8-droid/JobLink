import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  const { data: companies, error } = await admin
    .from('companies')
    .select('id, company_name, industry, location, logo_url, contact_email')
    .order('company_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ companies: companies || [] })
}
