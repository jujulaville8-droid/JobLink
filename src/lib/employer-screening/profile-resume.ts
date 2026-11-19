import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applicantCvPath } from '../applicant-cv-path'
import { PDF_EXTRACTION_LIMITS } from './pdf-extraction'

/** The caller supplies the existing service client; paths stay bound to the applicant. */
export async function loadProfileResume(db: SupabaseClient, userId: string, signal: AbortSignal): Promise<Uint8Array | null> {
  const { data, error } = await db.from('seeker_profiles').select('cv_url').eq('user_id', userId).abortSignal(signal).maybeSingle()
  if (error) throw new Error('Profile resume unavailable')
  const path = applicantCvPath(data?.cv_url, userId)
  if (!path || !/\.(pdf|jpe?g|png)$/i.test(path)) return null
  if (signal.aborted) throw new Error('Profile resume cancelled')
  const { data: file, error: downloadError } = await db.storage.from('cvs').download(path)
  if (downloadError) throw new Error('Profile resume unavailable')
  if (signal.aborted) throw new Error('Profile resume cancelled')
  if (!file || !file.size || file.size > PDF_EXTRACTION_LIMITS.bytes) return null
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (signal.aborted) throw new Error('Profile resume cancelled')
  const matches = /\.pdf$/i.test(path)
    ? Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-'
    : /\.png$/i.test(path)
      ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return matches ? bytes : null
}
