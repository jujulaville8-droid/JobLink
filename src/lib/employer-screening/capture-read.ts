/** Capture-only bounded database reads. Normal application clients are unchanged. */
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CvFull } from '@/lib/types'
import { BUILDER_CAPTURE_LIMITS } from './builder-render'

export const CAPTURE_READ_LIMITS = Object.freeze({ responseBytes: 128 * 1024, totalBytes: 256 * 1024 })
export type CaptureReadOptions = { signal: AbortSignal; deadline: number;
  responseBytes?: number; totalBytes?: number }

/** Enforce byte admission BEFORE the SDK can call response.json(). A shared
 * counter/abort signal bounds all concurrent builder reads, not just each table. */
export function boundedCaptureFetch(options: CaptureReadOptions & { fetch?: typeof fetch }): typeof fetch {
  const upstream = options.fetch ?? fetch
  const responseLimit = options.responseBytes ?? CAPTURE_READ_LIMITS.responseBytes
  const totalLimit = options.totalBytes ?? CAPTURE_READ_LIMITS.totalBytes
  if (!Number.isSafeInteger(responseLimit) || responseLimit < 1 || responseLimit > 5 * 1024 * 1024 ||
      !Number.isSafeInteger(totalLimit) || totalLimit < 1 || totalLimit > 6 * 1024 * 1024) throw new Error('Capture read limit')
  const controller = new AbortController()
  let totalBytes = 0
  return async (input, init) => {
    const remaining = options.deadline - Date.now()
    if (!Number.isSafeInteger(options.deadline) || remaining <= 0 || options.signal.aborted || controller.signal.aborted) {
      throw new Error('Capture read unavailable')
    }
    const signals = [options.signal, controller.signal]
    if (init?.signal) signals.push(init.signal)
    if (input instanceof Request) signals.push(input.signal)
    const signal = AbortSignal.any(signals)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    const expired = () => signal.aborted || Date.now() >= options.deadline
    const read = async () => {
      const response = await upstream(input, { ...init, signal })
      if (expired()) { void response.body?.cancel().catch(() => {}); throw new Error('Capture read unavailable') }
      const declared = response.headers.get('content-length')
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > responseLimit)) {
        controller.abort(); void response.body?.cancel().catch(() => {}); throw new Error('Capture read limit')
      }
      if (!response.body) return response
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const part = await reader.read()
        if (expired()) throw new Error('Capture read unavailable')
        if (part.done) break
        size += part.value.byteLength; totalBytes += part.value.byteLength
        if (size > responseLimit || totalBytes > totalLimit) {
          controller.abort(); throw new Error('Capture read limit')
        }
        chunks.push(part.value)
      }
      const body = Buffer.concat(chunks)
      const headers = new Headers(response.headers)
      // The new body is already decoded and bounded; preserve status/other headers.
      headers.delete('content-length'); headers.delete('content-encoding')
      return new Response(body, { status: response.status, statusText: response.statusText, headers })
    }
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Capture read deadline')) }, remaining)
      })
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Capture read cancelled'))
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
      return await Promise.race([read(), timeout, cancelled])
    } catch {
      controller.abort()
      throw new Error('Capture read unavailable')
    } finally {
      if (timer) clearTimeout(timer)
      if (abort) signal.removeEventListener('abort', abort)
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock() } catch { /* Pending read is being aborted. */ } }
    }
  }
}

export function createBoundedCaptureReadClient(options: CaptureReadOptions): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Capture read unavailable')
  return createClient(url, key, { global: { fetch: boundedCaptureFetch(options) },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
const tables = [
  ['experiences', 'cv_work_experiences', 'id,cv_profile_id,company_name,job_title,location,start_date,end_date,is_current,description,sort_order'],
  ['education', 'cv_education', 'id,cv_profile_id,institution,degree,field_of_study,start_date,end_date,is_current,description,sort_order'],
  ['skills', 'cv_skills', 'id,cv_profile_id,name,sort_order'],
  ['awards', 'cv_awards', 'id,cv_profile_id,title,issuer,date_received,description,sort_order'],
  ['certifications', 'cv_certifications', 'id,cv_profile_id,name,issuing_organization,issue_date,expiry_date,sort_order'],
  ['projects', 'cv_projects', 'id,cv_profile_id,title,role,url,description,start_date,end_date,sort_order'],
  ['languages', 'cv_languages', 'id,cv_profile_id,name,proficiency,sort_order'],
  ['volunteer', 'cv_volunteer', 'id,cv_profile_id,organization,role,description,start_date,end_date,is_current,sort_order'],
  ['memberships', 'cv_memberships', 'id,cv_profile_id,organization,role,year_joined,sort_order'],
  ['references', 'cv_references', 'id,cv_profile_id,name,title,company,phone,email,relationship,sort_order'],
] as const

/** A 51st row rejects the whole CV rather than silently truncating its contents. */
export async function loadBoundedBuilder(db: SupabaseClient, userId: string): Promise<CvFull | null> {
  const { data: profile, error } = await db.from('cv_profiles')
    .select('id,user_id,job_title,summary,completion_percentage,created_at,updated_at').eq('user_id', userId).single()
  if (error || !profile || profile.user_id !== userId) return null
  const rows = await Promise.all(tables.map(async ([key, table, fields]) => {
    const { data, error } = await db.from(table).select(fields).eq('cv_profile_id', profile.id)
      .order('sort_order').limit(BUILDER_CAPTURE_LIMITS.arrayItems + 1)
    if (error || !Array.isArray(data) || data.length > BUILDER_CAPTURE_LIMITS.arrayItems) throw new Error('Builder unavailable')
    return [key, data] as const
  }))
  const [seeker, account] = await Promise.all([
    db.from('seeker_profiles').select('first_name,last_name,phone,location').eq('user_id', userId).single(),
    db.from('users').select('email').eq('id', userId).single(),
  ])
  if (seeker.error || account.error || !seeker.data || !account.data) return null
  return { profile, ...Object.fromEntries(rows), contact: {
    first_name: seeker.data.first_name, last_name: seeker.data.last_name,
    email: account.data.email, phone: seeker.data.phone, location: seeker.data.location,
  } } as CvFull
}
