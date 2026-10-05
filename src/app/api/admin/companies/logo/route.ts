import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY_ID_PATTERN, MAX_LOGO_BYTES, isCompanyLogoStorageUrl, normalizeAdminCompanyLogo } from '@/lib/admin-company-logo'

/** Admin uploads share the public logo bucket, with separate company-scoped paths. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  let companyId = ''
  let logoUrl: string | null | undefined
  let file: File | null = null
  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData()
      companyId = String(form.get('company_id') || '').trim()
      const rawFile = form.get('file')
      if (rawFile instanceof File) file = rawFile
      if (form.has('logo_url')) logoUrl = String(form.get('logo_url') || '').trim()
    } else {
      const body = await req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.company_id !== 'string') throw new Error()
      companyId = body.company_id.trim()
      if (Object.hasOwn(body, 'logo_url')) {
        if (body.logo_url !== null && typeof body.logo_url !== 'string') throw new Error()
        logoUrl = body.logo_url?.trim() || null
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!COMPANY_ID_PATTERN.test(companyId)) {
    return NextResponse.json({ error: 'A valid company_id is required' }, { status: 400 })
  }
  if (!file && logoUrl === undefined) {
    return NextResponse.json({ error: 'Provide a file upload or a logo_url value.' }, { status: 400 })
  }
  if (file && logoUrl !== undefined) {
    return NextResponse.json({ error: 'Provide a file upload or logo_url, not both.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: company, error } = await admin.from('companies')
    .select('id, user_id, company_name, logo_url').eq('id', companyId).maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to load company.' }, { status: 503 })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const storage = admin.storage.from('company-logos')
  // Fetch by the validated bucket key, never by a user-supplied external URL.
  // Existing public objects need the same raster checks as uploaded files.
  if (!file && logoUrl) {
    if (!isCompanyLogoStorageUrl(logoUrl, companyId, company.user_id, storageBase)) {
      return NextResponse.json({ error: 'Use a company-owned URL from company-logos storage, or upload an image.' }, { status: 400 })
    }
    const path = new URL(logoUrl).pathname.slice('/storage/v1/object/public/company-logos/'.length)
    const { data: storedLogo, error: downloadError } = await storage.download(path)
    if (downloadError || !storedLogo || storedLogo.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Stored logo is unavailable or exceeds 5MB. Upload an image instead.' }, { status: 400 })
    }
    file = new File([storedLogo], path.split('/').pop() || 'logo', { type: storedLogo.type })
  }
  let uploadedPath: string | undefined
  if (file) {
    let buffer: Buffer
    try {
      buffer = await normalizeAdminCompanyLogo(file)
    } catch {
      return NextResponse.json({ error: 'Logo must contain a valid, still PNG, JPEG, or WebP image under 5MB.' }, { status: 400 })
    }
    uploadedPath = `admin/${companyId}/${randomUUID()}.png`
    const { error: uploadError } = await storage.upload(uploadedPath, buffer, {
      upsert: false, contentType: 'image/png', cacheControl: '3600',
    })
    if (uploadError) return NextResponse.json({ error: 'Failed to upload logo.' }, { status: 503 })
    logoUrl = storage.getPublicUrl(uploadedPath).data.publicUrl
  }

  const nextUrl = logoUrl || null
  if (nextUrl && !isCompanyLogoStorageUrl(nextUrl, companyId, company.user_id, storageBase)) {
    if (uploadedPath) await storage.remove([uploadedPath])
    return NextResponse.json({ error: 'Use a company-owned URL from company-logos storage, or upload an image.' }, { status: uploadedPath ? 503 : 400 })
  }

  const { data: updated, error: updateError } = await admin.from('companies')
    .update({ logo_url: nextUrl }).eq('id', companyId).select('id, company_name, logo_url').single()
  if (updateError || !updated) {
    if (uploadedPath) await storage.remove([uploadedPath])
    return NextResponse.json({ error: 'Failed to update company logo.' }, { status: 503 })
  }
  return NextResponse.json({ success: true, company: updated })
}
