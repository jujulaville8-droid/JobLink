import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify caller is admin
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (adminError || !adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { status, is_featured } = body

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}

    if (status !== undefined) {
      const validStatuses = ['active', 'closed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updates.status = status
    }

    if (typeof is_featured === 'boolean') {
      updates.is_featured = is_featured
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Get the listing before updating (to check previous status and get details for email)
    const { data: currentListing } = await supabase
      .from('job_listings')
      .select('status, title, company_id, companies(user_id)')
      .eq('id', id)
      .single()

    const { data: updatedListing, error: updateError } = await supabase
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
        const { data: employerUser } = await supabase
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

    return NextResponse.json({ listing: updatedListing })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
