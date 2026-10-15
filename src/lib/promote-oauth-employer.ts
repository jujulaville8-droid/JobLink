import type { SupabaseClient, User } from '@supabase/supabase-js'

/** Google creates the Auth user moments before the callback runs. */
export const NEW_OAUTH_ACCOUNT_WINDOW_MS = 15 * 60 * 1000

/**
 * Google sends no role, so the new-user trigger always creates a `seeker` row
 * for an OAuth signup, even one that started from employer sign-in. Promote
 * only that untouched row: a Google-only account created in the last few
 * minutes, still a non-admin, non-banned seeker, with no seeker profile and no
 * company. Existing seekers, admins and anyone with data are never changed.
 * The update is compare-and-set, so it cannot overwrite a concurrent change.
 */
export async function promoteNewOAuthEmployer(admin: SupabaseClient, user: User, now = Date.now()): Promise<boolean> {
  if (user.app_metadata?.provider !== 'google') return false
  const providers = user.app_metadata?.providers
  if (Array.isArray(providers) && providers.some(provider => provider !== 'google')) return false
  if (user.identities?.some(identity => identity.provider !== 'google')) return false
  const createdAt = Date.parse(user.created_at)
  if (!Number.isFinite(createdAt) || now - createdAt > NEW_OAUTH_ACCOUNT_WINDOW_MS || createdAt - now > 60_000) return false

  const { data: row, error } = await admin.from('users').select('role, is_admin, is_banned').eq('id', user.id).single()
  if (error || !row || row.role !== 'seeker' || row.is_admin !== false || row.is_banned !== false) return false

  const [profiles, companies] = await Promise.all([
    admin.from('seeker_profiles').select('id').eq('user_id', user.id).limit(1),
    admin.from('companies').select('id').eq('user_id', user.id).limit(1),
  ])
  if (profiles.error || companies.error || !Array.isArray(profiles.data) || !Array.isArray(companies.data)) return false
  if (profiles.data.length || companies.data.length) return false

  const { data: updated, error: updateError } = await admin.from('users')
    .update({ role: 'employer' })
    .eq('id', user.id).eq('role', 'seeker').eq('is_admin', false).eq('is_banned', false)
    .select('id')
  return !updateError && Array.isArray(updated) && updated.length === 1
}
