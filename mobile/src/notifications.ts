import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { db } from './client'

// Flip to true only after the production push gates are done: the push_tokens
// migration applied to production and FCM credentials configured in EAS.
// While false the app never prompts for permission, registers a token, or
// shows the Job alerts toggle, so the feature can ship dark in a build.
export const PUSH_ENABLED = false

// Matches extra.eas.projectId in app.json. Expo push tokens are issued per project.
const PROJECT_ID = 'b27ceb08-a310-4e89-8203-ccb08420e61a'
const TOKEN_KEY = 'push-token'
const DECISION_KEY = 'push-decision'
const CHANNEL_ID = 'default'

export type RegisterResult =
  | { status: 'registered' }
  | { status: 'denied' | 'unavailable' }
  | { status: 'error'; message: string }

export type Decision = 'enabled' | 'declined'

// Show alerts that arrive while the app is open instead of dropping them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

// SecureStore has no web implementation, so keep a memory fallback like client.ts does.
const memory = new Map<string, string>()
async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memory.get(key) ?? null
  try { return await SecureStore.getItemAsync(key) } catch { return memory.get(key) ?? null }
}
async function setSecret(key: string, value: string) {
  memory.set(key, value)
  if (Platform.OS === 'web') return
  try { await SecureStore.setItemAsync(key, value) } catch { /* The memory copy still serves this session. */ }
}

/** Android delivers pushes through a named channel; create the one the server sends on. */
export async function ensureChannel() {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Job alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#095355',
    })
  } catch { /* A missing channel only affects presentation, never registration. */ }
}
void ensureChannel()

export async function hasPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync()
    return current.granted || current.status === 'granted'
  } catch { return false }
}

export function getStoredToken() {
  return getSecret(TOKEN_KEY)
}

export async function getDecision(): Promise<Decision | null> {
  const value = await getSecret(DECISION_KEY)
  return value === 'enabled' || value === 'declined' ? value : null
}

export function setDecision(value: Decision) {
  return setSecret(DECISION_KEY, value)
}

async function fetchToken(): Promise<string> {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })
  return data
}

async function claimToken(userId: string, token: string) {
  const { error } = await db.from('push_tokens').upsert(
    { user_id: userId, expo_push_token: token, platform: Platform.OS, enabled: true, updated_at: new Date().toISOString() },
    { onConflict: 'expo_push_token' },
  )
  if (error) throw error
}

/**
 * Full registration: permission prompt included. Used when the user taps
 * Enable, in the opt in card or the Account toggle.
 */
export async function registerForPush(userId: string): Promise<RegisterResult> {
  if (!Device.isDevice) return { status: 'unavailable' }
  await ensureChannel()
  try {
    let granted = await hasPermission()
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync()
      granted = requested.granted || requested.status === 'granted'
    }
    if (!granted) return { status: 'denied' }
    const token = await fetchToken()
    await setSecret(TOKEN_KEY, token)
    await claimToken(userId, token)
    return { status: 'registered' }
  } catch (e) {
    return { status: 'error', message: (e as Error).message }
  }
}

/**
 * Silent re-registration for app start when the user already opted in. Never
 * prompts: if permission was revoked in phone settings this does nothing and
 * the Account toggle shows the true state.
 */
export async function refreshRegistration(userId: string): Promise<void> {
  if (!Device.isDevice) return
  if (!(await hasPermission())) return
  try {
    const token = await fetchToken()
    await setSecret(TOKEN_KEY, token)
    await claimToken(userId, token)
  } catch { /* A failed background refresh leaves the stored state alone. */ }
}

/**
 * The toggle state for this user. Prefers this device's own row; the phone
 * permission always wins, since a revoked permission means no alerts arrive
 * whatever the row says.
 */
export async function getAlertsOn(userId: string): Promise<boolean> {
  if (!(await hasPermission())) return false
  const token = await getStoredToken()
  if (token) {
    const own = await db.from('push_tokens').select('enabled').eq('expo_push_token', token).maybeSingle()
    if (!own.error && own.data) return !!own.data.enabled
  }
  const any = await db.from('push_tokens').select('enabled').eq('user_id', userId).eq('enabled', true).limit(1)
  if (any.error) return false
  return (any.data ?? []).length > 0
}

/**
 * Turn alerts on or off for the user. Turning off flags every row the user
 * owns as disabled and keeps the rows, so re-enabling and history stay simple.
 * Returns null on success. On failure it returns the register status
 * ('denied' or 'unavailable') or an error message, so callers can word the
 * outcome correctly.
 */
export async function setAlertsEnabled(userId: string, enabled: boolean): Promise<string | null> {
  if (enabled) {
    const result = await registerForPush(userId)
    return result.status === 'registered' ? null : result.status === 'error' ? result.message : result.status
  }
  const { error } = await db.from('push_tokens')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  return error ? error.message : null
}

/** Sign out: stop alerts to this device without touching the user's other devices. Best effort. */
export async function disableCurrentDevice(): Promise<void> {
  try {
    const token = await getStoredToken()
    if (!token) return
    await db.from('push_tokens')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('expo_push_token', token)
  } catch { /* Signing out must never fail because of a push update. */ }
}
