import 'react-native-url-polyfill/auto'
import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient, processLock } from '@supabase/supabase-js'

export const SITE = process.env.EXPO_PUBLIC_SITE_URL || 'https://joblinkantigua.com'
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
export const configured = !!url && !!key

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

export const db = createClient(url || 'https://example.supabase.co', key || 'unconfigured', {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
})
if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') db.auth.startAutoRefresh()
  AppState.addEventListener('change', state => state === 'active' ? db.auth.startAutoRefresh() : db.auth.stopAutoRefresh())
}

export async function api<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await db.auth.getSession()
  if (!session) throw new Error('Please sign in first.')
  const response = await fetch(`${SITE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data as T
}
