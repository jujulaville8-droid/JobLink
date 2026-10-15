// 32 random bytes encoded with base64url, without padding.
export const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const CLAIM_REQUIRED_MESSAGE = 'This company already has a listing on JobLink. Use your claim link or contact employers@joblinkantigua.com.'

export function claimReturnTo(value: unknown): string | null {
  return typeof value === 'string' && /^\/claim\/[A-Za-z0-9_-]{43}$/.test(value) ? value : null
}

/** Only these onboarding destinations may survive authentication. */
export function onboardingReturnTo(value: unknown): string | null {
  return value === '/members' ? value : claimReturnTo(value)
}

export function withReturnTo(path: string, destination: unknown): string {
  const safe = onboardingReturnTo(destination)
  return safe ? `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(safe)}` : path
}

export const CLAIM_UNAVAILABLE_MESSAGE = 'This claim link is invalid, has expired, or has already been used. Please ask the JobLink team for a new link.'

/** Preserve existing same-origin login destinations without accepting redirects
 * to an external host, backslash URL, or encoded control character. */
export function safeAuthReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  try {
    const decoded = decodeURIComponent(value)
    if (/\\|[\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith('//')) return null
    return value
  } catch { return null }
}
