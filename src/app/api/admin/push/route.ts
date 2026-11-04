import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// Bulk work needs more than the default function timeout.
export const maxDuration = 300

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const PAGE_SIZE = 1000
const CHUNK_SIZE = 100
const CHUNK_TIMEOUT_MS = 30_000

interface ExpoTicket {
  status?: string
  details?: { error?: string }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * GET /api/admin/push
 * Number of devices currently able to receive a push.
 */
export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { count, error } = await createAdminClient()
      .from('push_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('enabled', true)
    if (error) throw error

    return NextResponse.json({ devices: count ?? 0 })
  } catch (err) {
    console.error('[admin-push] Failed to count devices', err)
    return NextResponse.json({ error: 'Could not count devices' }, { status: 500 })
  }
}

/**
 * POST /api/admin/push
 * Send a push notification to every enabled device through the Expo push
 * service, removing any token Expo reports as no longer registered.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const payload = await request.json().catch(() => null)
    const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
    const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : ''

    if (!title || !body) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Ordered so that pages stay stable while we walk them.
    const tokens: string[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from('push_tokens')
        .select('expo_push_token')
        .eq('enabled', true)
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      const rows = data ?? []
      for (const row of rows) tokens.push(row.expo_push_token)
      if (rows.length < PAGE_SIZE) break
    }

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, pruned: 0 })
    }

    let sent = 0
    let failed = 0
    const deadTokens: string[] = []

    for (const batch of chunk(tokens, CHUNK_SIZE)) {
      const messages = batch.map((to) => ({
        to,
        title,
        body,
        sound: 'default',
        channelId: 'default',
        priority: 'default',
        data: jobId ? { jobId } : {},
      }))

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS)

      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Expo responded with ${res.status}`)

        const json = await res.json()
        const tickets: ExpoTicket[] = Array.isArray(json?.data) ? json.data : []

        // Tickets line up with messages by position. A missing ticket means we
        // have no evidence of delivery, so it counts as failed.
        batch.forEach((token, index) => {
          const ticket = tickets[index]
          if (ticket?.status === 'ok') {
            sent++
            return
          }
          failed++
          if (ticket?.details?.error === 'DeviceNotRegistered') deadTokens.push(token)
        })
      } catch (err) {
        console.error('[admin-push] Chunk failed', err)
        failed += batch.length
      } finally {
        clearTimeout(timeout)
      }
    }

    // Batched because the tokens travel in the request URL.
    let pruned = 0
    for (const batch of chunk(deadTokens, CHUNK_SIZE)) {
      const { error } = await admin.from('push_tokens').delete().in('expo_push_token', batch)
      if (error) {
        console.error('[admin-push] Failed to prune tokens', error)
      } else {
        pruned += batch.length
      }
    }

    return NextResponse.json({ sent, failed, pruned })
  } catch (err) {
    console.error('[admin-push] Failed', err)
    return NextResponse.json({ error: 'Could not send the notification' }, { status: 500 })
  }
}
