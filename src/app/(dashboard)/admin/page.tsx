import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'

export default async function AdminPage() {
  await requireRole('admin')
  redirect('/admin/approvals')
}
