import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import ApplicationsWorkspace from '@/components/admin-applications/ApplicationsWorkspace'
import { defaultApplicationDates, UUID_PATTERN } from '@/lib/admin-applications'

export default async function AdminJobApplicationsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  if (!UUID_PATTERN.test(jobId)) notFound()
  return <Suspense fallback={<p role="status">Loading applicants…</p>}>
    <ApplicationsWorkspace jobId={jobId} initialDates={defaultApplicationDates()} />
  </Suspense>
}
