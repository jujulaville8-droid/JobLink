'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { withReturnTo } from '@/lib/claim-links'

export default function ClaimAccountSwitch({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="mt-4"><button type="button" disabled={busy} className="min-h-11 text-primary underline disabled:opacity-60" onClick={async () => {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      window.location.assign(withReturnTo('/employer/login', returnTo))
    } catch { setError('Could not sign out. Please try again.'); setBusy(false) }
  }}>{busy ? 'Signing out…' : 'Sign out and use an employer account'}</button>{error && <p role="alert">{error}</p>}</div>
}
