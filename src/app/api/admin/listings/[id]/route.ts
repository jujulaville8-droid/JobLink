import { after, NextRequest, NextResponse } from 'next/server'
import { processJobAlerts } from '@/lib/job-alert-matcher'
import { sendEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api-auth'

import { INDUSTRIES, JOB_TYPE_LABELS } from '@/lib/types'

export const maxDuration = 300

const TEXT_FIELDS = ['title', 'description', 'category', 'job_type', 'location'] as const
const ALLOWED_FIELDS: string[] = ['status', 'is_featured', ...TEXT_FIELDS]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireAdmin()
    if ('error' in auth) return auth.error

    const admin = createAdminClient()

    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const unknownFields = Object.keys(body).filter(key => !ALLOWED_FIELDS.includes(key))
    if (unknownFields.length) {
      return NextResponse.json({ error: `Unknown fields: ${unknownFields.join(', ')}` }, { status: 400 })
    }
    const { status, is_featured } = body

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}

    // Content edits use the service-role client, so a live listing stays
    // active instead of returning to pending_approval.
    for (const field of TEXT_FIELDS) {
      if (body[field] === undefined) continue
      const value = typeof body[field] === 'string' ? body[field].trim() : ''
      if (!value) {
        return NextResponse.json({ error: `${field} must be a non-empty string` }, { status: 400 })
      }
      if (field === 'category' && !INDUSTRIES.includes(value)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }
      if (field === 'job_type' && !Object.hasOwn(JOB_TYPE_LABELS, value)) {
        return NextResponse.json({ error: 'Invalid job_type' }, { status: 400 })
      }
      updates[field] = value
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'closed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updates.status = status
      if (status === 'active') updates.expires_at = null
    }

    if (typeof is_featured === 'boolean') {
      updates.is_featured = is_featured
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Get the listing before updating (to check previous status and get details for email)
    const { data: currentListing } = await admin
      .from('job_listings')
      .select('status, title, company_id, companies(user_id)')
      .eq('id', id)
      .single()

    const { data: updatedListing, error: updateError } = await admin
      .from('job_listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 })
    }

    if (!updatedListing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Send approval/rejection email to employer if status changed from pending_approval
    if (currentListing && currentListing.status === 'pending_approval' && status) {
      const companyData = Array.isArray(currentListing.companies)
        ? currentListing.companies[0]
        : currentListing.companies
      const employerUserId = (companyData as { user_id: string } | null)?.user_id

      if (employerUserId) {
        const { data: employerUser } = await admin
          .from('users')
          .select('email')
          .eq('id', employerUserId)
          .single()

        if (employerUser?.email) {
          if (status === 'active') {
            // Listing approved
            sendEmail({
              to: employerUser.email,
              type: 'listing_approved',
              data: {
                listing_title: currentListing.title,
              },
            })
          } else if (status === 'closed') {
            // Listing rejected
            sendEmail({
              to: employerUser.email,
              type: 'listing_rejected',
              data: {
                listing_title: currentListing.title,
              },
            })
          }
        }
      }
    }

    if (status === 'active' && currentListing && currentListing.status !== 'active') {
      after(async () => { await processJobAlerts(id) })
    }

    return NextResponse.json({ listing: updatedListing })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
