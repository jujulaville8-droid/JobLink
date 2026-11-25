import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import EmployerBillingAdmin from '@/components/employer-billing/EmployerBillingAdmin'
import { employerBillingEnabled } from '@/lib/employer-billing/config'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Employer billing', robots: { index: false } }

export default async function EmployerBillingAdminPage() {
  if (!employerBillingEnabled()) notFound()
  const auth = await requireAdmin()
  if ('error' in auth) redirect('/dashboard')
  return <EmployerBillingAdmin />
}
