import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import PushForm from './PushForm'

export default async function AdminPushPage() {
  await requireRole('admin')

  const { count, error } = await createAdminClient()
    .from('push_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('enabled', true)

  if (error) console.error('[admin-push] Failed to count devices', error)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Push notifications
      </h1>
      <p className="mt-1 text-sm text-text-light">
        Send a notification to everyone with the app installed and notifications turned on.
      </p>

      <div className="mt-8">
        <PushForm initialDevices={error ? null : count ?? 0} />
      </div>
    </div>
  )
}
