import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function isValidLogoUrl(value: string): boolean {
  if (!value) return true
  if (value.length > 1000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function assertCompanyExists(admin: ReturnType<typeof createAdminClient>, companyId: string) {
  const { data, error } = await admin
    .from('companies')
    .select('id, company_name, logo_url')
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!data) {
    return { error: NextResponse.json({ error: 'Company not found' }, { status: 404 }) }
  }
  return { company: data }
}

/**
 * Admin: set or replace a company's logo_url.
 *
 * Accepts multipart form data with:
 *   - company_id (required)
 *   - file (image) OR logo_url (https URL / empty to clear)
 *
 * File uploads go to the public company-logos bucket under admin/{companyId}/…
 * using the service-role client so placeholder companies work too.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const contentType = req.headers.get('content-type') || ''

  let companyId = ''
  let logoUrl: string | null | undefined
  let file: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    companyId = String(form.get('company_id') || '').trim()
    const rawFile = form.get('file')
    if (rawFile instanceof File && rawFile.size > 0) {
      file = rawFile
    }
    if (form.has('logo_url')) {
      logoUrl = String(form.get('logo_url') || '').trim()
    }
  } else {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    companyId = String((body as { company_id?: string }).company_id || '').trim()
    if ('logo_url' in (body as object)) {
      const raw = (body as { logo_url?: string | null }).logo_url
      logoUrl = raw == null ? '' : String(raw).trim()
    }
  }

  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  }

  const existing = await assertCompanyExists(admin, companyId)
  if ('error' in existing) return existing.error

  if (file) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Logo must be a PNG, JPEG, or WebP image.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be under 5MB.' }, { status: 400 })
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
    const path = `admin/${companyId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from('company-logos')
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload logo' },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl },
    } = admin.storage.from('company-logos').getPublicUrl(path)

    logoUrl = publicUrl
  } else if (logoUrl === undefined) {
    return NextResponse.json(
      { error: 'Provide a file upload or a logo_url value.' },
      { status: 400 }
    )
  }

  const nextUrl = logoUrl || null
  if (nextUrl && !isValidLogoUrl(nextUrl)) {
    return NextResponse.json(
      { error: 'logo_url must be an http(s) URL under 1000 characters.' },
      { status: 400 }
    )
  }

  const { data: updated, error: updateError } = await admin
    .from('companies')
    .update({ logo_url: nextUrl })
    .eq('id', companyId)
    .select('id, company_name, logo_url')
    .single()

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || 'Failed to update company logo' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, company: updated })
}
