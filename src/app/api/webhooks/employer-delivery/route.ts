import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEmployerReceipt } from '@/lib/employer-screening/receipts'
export const runtime = 'nodejs'
/** Provisioning this webhook and its signing secret requires separate deployment approval. */
export async function POST(request: NextRequest) {
  if (process.env.EMPLOYER_OUTBOX_RECEIPTS_ENABLED !== 'true' || !process.env.EMPLOYER_DELIVERY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Disabled' }, { status: 503 })
  }
  const id = request.headers.get('svix-id'), timestamp = request.headers.get('svix-timestamp'), signature = request.headers.get('svix-signature')
  if (!id || !timestamp || !signature || !request.body) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 })
  const reader = request.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 65_536) { await reader.cancel(); return NextResponse.json({ error: 'Too large' }, { status: 413 }) }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try {
    const result = await recordEmployerReceipt({ payload: Buffer.concat(chunks).toString('utf8'), id, timestamp, signature,
      webhookSecret: process.env.EMPLOYER_DELIVERY_WEBHOOK_SECRET }, createAdminClient())
    // An unmatched valid receipt is retried by the provider rather than discarded.
    return NextResponse.json({ status: result }, { status: result === 'unmatched' ? 503 : 200 })
  } catch { return NextResponse.json({ error: 'Receipt not accepted' }, { status: 400 }) }
}
