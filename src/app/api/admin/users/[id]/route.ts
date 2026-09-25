import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    const { user } = auth

    const admin = createAdminClient()

    const body = await request.json()
    const { is_banned } = body

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}

    if (typeof is_banned === 'boolean') {
      updates.is_banned = is_banned
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Prevent admin from banning themselves
    if (id === user.id && updates.is_banned === true) {
      return NextResponse.json({ error: 'Cannot ban your own account' }, { status: 400 })
    }

    const { data: updatedUser, error: updateError } = await admin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: updatedUser })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
