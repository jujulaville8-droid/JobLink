import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCompanyContactEmail } from '@/lib/company-contact-email'

const COMPANY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.company_id !== 'string' || !COMPANY_ID_PATTERN.test(body.company_id)
    || !Object.hasOwn(body, 'contact_email')) {
    return NextResponse.json({ error: 'Provide company_id and contact_email.' }, { status: 400 })
  }
  const contact = parseCompanyContactEmail(body.contact_email)
  if (!contact.valid) {
    return NextResponse.json({ error: 'Enter one valid employer notification email, or leave it blank to clear.' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data: company, error } = await admin.from('companies')
    .update({ contact_email: contact.email }).eq('id', body.company_id)
    .select('id, company_name, contact_email').maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to save employer notification email.' }, { status: 503 })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  return NextResponse.json({ success: true, company })
}
