import { ownedCvPath } from './cv-upload'

/** Normalize legacy storage URLs without accepting another host, bucket or owner. */
export function applicantCvPath(value: unknown, userId: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 2000) return null
  let path = value
  if (/^https?:/i.test(path)) {
    try {
      const url = new URL(path)
      const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
      if (url.origin !== origin || url.username || url.password) return null
      const prefix = ['/storage/v1/object/public/cvs/', '/storage/v1/object/sign/cvs/']
        .find(marker => url.pathname.startsWith(marker))
      if (!prefix) return null
      path = decodeURIComponent(url.pathname.slice(prefix.length))
    } catch { return null }
  }
  // Uploaded CVs belong to the seeker's auth-user folder. No nested paths,
  // encoded separators, traversal, queries, or arbitrary URLs reach service storage.
  return ownedCvPath(path, userId) ? path : null
}

