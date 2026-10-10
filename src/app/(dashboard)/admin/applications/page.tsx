import { Suspense } from 'react'
import ApplicationsWorkspace from '@/components/admin-applications/ApplicationsWorkspace'
import { defaultApplicationDates } from '@/lib/admin-applications'

export default function AdminApplicationsPage() {
  return <Suspense fallback={<p role="status">Loading applications…</p>}>
    <ApplicationsWorkspace initialDates={defaultApplicationDates()} />
  </Suspense>
}
