import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Missing configuration')
    const headers = { apikey: key, Authorization: `Bearer ${key}` }
    const results = await Promise.all([
      fetch(`${url}/rest/v1/job_listings?select=id&limit=1`, { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }),
      fetch(`${url}/auth/v1/health`, { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }),
    ])
    if (results.some((r) => !r.ok)) throw new Error('Upstream unavailable')
    return NextResponse.json({ status: 'ok', database: 'reachable', auth: 'reachable' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })
  }
}
