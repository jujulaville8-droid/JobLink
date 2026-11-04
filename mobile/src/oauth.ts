import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { db } from './client'

WebBrowser.maybeCompleteAuthSession()

export const GOOGLE_REDIRECT_URL = makeRedirectUri({ scheme: 'joblinks', path: 'auth-callback' })

// The browser result and the deep link listener can both deliver the same code, and a code only works once.
const processed = new Set<string>()

function decode(value: string) {
  const spaced = value.replace(/\+/g, ' ')
  try { return decodeURIComponent(spaced) }
  catch { return spaced }
}

function parseParams(url: string) {
  const params = new Map<string, string>()
  const start = url.indexOf('?')
  if (start < 0) return params
  const query = url.slice(start + 1).split('#')[0]
  for (const pair of query.split('&')) {
    if (!pair) continue
    const split = pair.indexOf('=')
    if (split < 0) params.set(decode(pair), '')
    else params.set(decode(pair.slice(0, split)), decode(pair.slice(split + 1)))
  }
  return params
}

export async function completeOAuthFromUrl(url: string): Promise<boolean> {
  if (!url.includes('auth-callback')) return false
  const params = parseParams(url)
  if (params.has('error')) throw new Error(params.get('error_description') || 'Could not sign you in. Please try again.')
  const code = params.get('code')
  if (!code || processed.has(code)) return false
  processed.add(code)
  const { error } = await db.auth.exchangeCodeForSession(code)
  if (error) { processed.delete(code); throw error }
  return true
}

export async function signInWithGoogle(): Promise<{ cancelled: boolean }> {
  const redirectTo = GOOGLE_REDIRECT_URL
  const { data, error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })
  if (error) throw error
  if (!data.url) throw new Error('Could not start Google sign in. Please try again.')
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type === 'cancel' || result.type === 'dismiss') return { cancelled: true }
  if (result.type !== 'success') return { cancelled: true }
  await completeOAuthFromUrl(result.url)
  return { cancelled: false }
}
