'use client'

import { Fragment, type ReactNode } from 'react'
import { useAuth } from '@/components/AuthProvider'

/** Discard private reads on cross-tab sign-out or account changes. API auth remains authoritative. */
export default function AdminApplicationsSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <p role="status">Checking your admin session…</p>
  if (!user) return <p role="alert">Your session has ended. Sign in again to view applications.</p>
  return <Fragment key={user.id}>{children}</Fragment>
}
