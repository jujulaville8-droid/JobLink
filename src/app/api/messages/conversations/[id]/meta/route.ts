import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Single conversation metadata via optimized RPC
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('get_conversation_meta', {
      p_user_id: user.id,
      p_conversation_id: conversationId,
    })

    if (error) {
      console.error('[meta] RPC error:', error.message, error.details, error.hint)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    if (!data || data.length === 0) {
      console.error('[meta] No data returned for conversation:', conversationId, 'user:', user.id)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Also fetch application_id from the conversation row
    const { data: convRow } = await supabase
      .from('conversations')
      .select('application_id')
      .eq('id', conversationId)
      .single()

    const meta = { ...data[0], application_id: convRow?.application_id ?? null }

    // For invite conversations (no application), enrich with company info
    if (!convRow?.application_id && meta.other_user_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('company_name, logo_url')
        .eq('user_id', meta.other_user_id)
        .maybeSingle()

      if (company) {
        meta.other_display_name = company.company_name
        meta.other_avatar_url = company.logo_url || meta.other_avatar_url
        meta.job_title = 'Invitation'
        meta.company_name = company.company_name
      }
    }

    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
