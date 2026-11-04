import 'react-native-url-polyfill/auto'
import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as ExpoCrypto from 'expo-crypto'
import { createClient, processLock } from '@supabase/supabase-js'

export const SITE = process.env.EXPO_PUBLIC_SITE_URL || 'https://joblinkantigua.com'
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
export const configured = !!url && !!key

export const TIMEOUT_MESSAGE = "That's taking too long. Check your connection and try again."
export const OFFLINE_MESSAGE = 'Could not connect. Check your connection and try again.'
export const SLOW_TIMEOUT = 45000
const READ_TIMEOUT = 15000
/** Prefer the timeout wording when a lower layer wraps it (postgrest prefixes the message). */
export const friendly = (message: string | undefined, fallback: string) => message?.includes(TIMEOUT_MESSAGE) ? TIMEOUT_MESSAGE : fallback
const timedFetch = (ms: number): typeof fetch => async (input, init) => {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, ms)
  const outer = init?.signal
  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', () => controller.abort())
  try { return await fetch(input, { ...init, signal: controller.signal }) }
  catch (e) { throw timedOut ? new Error(TIMEOUT_MESSAGE) : e }
  finally { clearTimeout(timer) }
}

// Session JSON can exceed a Keychain value's size limit. Write small chunks,
// then atomically switch the manifest so an interrupted write can't mix tokens.
const memory = new Map<string, string>()
const secureStorage = {
  async getItem(name: string) {
    if (Platform.OS === 'web') return memory.get(name) ?? null
    const raw = await SecureStore.getItemAsync(name)
    if (!raw) return null
    const keys: string[] = JSON.parse(raw)
    const pieces = await Promise.all(keys.map(k => SecureStore.getItemAsync(k)))
    return pieces.some(v => v === null) ? null : pieces.join('')
  },
  async setItem(name: string, value: string) {
    if (Platform.OS === 'web') { memory.set(name, value); return }
    const old = await SecureStore.getItemAsync(name)
    const chars = Array.from(value)
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const keys: string[] = []
    try {
      for (let i = 0; i < chars.length; i += 400) {
        const chunk = `${name}.${generation}.${keys.length}`
        keys.push(chunk)
        await SecureStore.setItemAsync(chunk, chars.slice(i, i + 400).join(''))
      }
      await SecureStore.setItemAsync(name, JSON.stringify(keys))
    } catch (error) {
      await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k)))
      throw error
    }
    if (old) await Promise.all((JSON.parse(old) as string[]).map(k => SecureStore.deleteItemAsync(k)))
  },
  async removeItem(name: string) {
    if (Platform.OS === 'web') { memory.delete(name); return }
    const raw = await SecureStore.getItemAsync(name)
    await SecureStore.deleteItemAsync(name)
    if (raw) await Promise.all((JSON.parse(raw) as string[]).map(k => SecureStore.deleteItemAsync(k)))
  },
}

// Hermes has no WebCrypto, and auth-js needs it to hash the PKCE challenge;
// without this shim it falls back to a plain challenge and Math.random values.
const webCrypto = ((globalThis as unknown as { crypto?: Record<string, unknown> }).crypto ?? {}) as Record<string, unknown>
if (typeof webCrypto.getRandomValues !== 'function') {
  webCrypto.getRandomValues = (array: Uint8Array) => { array.set(ExpoCrypto.getRandomBytes(array.length)); return array }
}
if (!webCrypto.subtle) {
  webCrypto.subtle = { digest: (_algorithm: string, data: ArrayBuffer) => ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data) }
}
;(globalThis as { crypto?: unknown }).crypto = webCrypto

export const db = createClient(url || 'https://example.supabase.co', key || 'unconfigured', {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock, flowType: 'pkce' },
  global: { fetch: timedFetch(READ_TIMEOUT) },
})
if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') db.auth.startAutoRefresh()
  AppState.addEventListener('change', state => state === 'active' ? db.auth.startAutoRefresh() : db.auth.stopAutoRefresh())
}

export async function api<T = Record<string, unknown>>(path: string, body: unknown, timeout = READ_TIMEOUT): Promise<T> {
  const { data: { session } } = await db.auth.getSession()
  if (!session) throw new Error('Please sign in first.')
  const response = await timedFetch(timeout)(`${SITE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  }).catch((e: Error) => { throw new Error(friendly(e.message, OFFLINE_MESSAGE)) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: response.status })
  return data as T
}
