import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'

export const metadata: Metadata = {
  title: 'Applications · Admin',
  robots: { index: false, follow: false },
}

export default async function AdminApplicationsLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    if (auth.error.status === 401) redirect('/login?returnTo=%2Fadmin%2Fapplications')
    notFound()
  }
  return children
}
