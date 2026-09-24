import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'

// Keep old bookmarks useful without retaining the retired discovery interface.
export default async function RetiredDiscoveryPage() {
  await requireRole('admin')
  redirect('/dashboard')
}
