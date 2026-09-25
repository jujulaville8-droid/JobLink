import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET: Fetch message templates for the current user's role
export async function GET() {
  try {
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: templates, error } = await supabase
      .from('message_templates')
      .select('id, role, label, body, sort_order')
      .eq('role', userData.role)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[templates] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
    }

    return NextResponse.json(templates || [])
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
