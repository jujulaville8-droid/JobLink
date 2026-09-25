'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function EmployerAccountGate({ allowSetup = false }: { allowSetup?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function setUpEmployer() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/switch-role', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'employer' }),
      })
      if (!response.ok) throw new Error('Setup failed')
      window.location.assign('/members')
    } catch {
      setError('Could not set up employer access. Please try again.')
      setBusy(false)
    }
  }
  async function continueAsEmployer(destination: string) {
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().auth.signOut({ scope: 'local' })
      if (error) throw error
      window.location.href = destination
    } catch {
      setError('Could not sign out. Please try again.')
      setBusy(false)
    }
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <h1 className="text-3xl font-bold text-primary">Browse candidates with an employer account</h1>
    <p className="my-6">You’re signed in with a non-employer account. Create an employer account to view candidate profiles, or sign in with your existing employer account.</p>
    {allowSetup && <div className="mb-6 rounded-xl border border-border p-4">
      <p className="mb-4">Already hiring? You can use this login by changing your account type from job seeker to employer. Your saved profile will be kept.</p>
      <button disabled={busy} className="min-h-12 rounded-lg bg-primary px-5 py-3 text-white disabled:opacity-50" onClick={setUpEmployer}>Set up employer access</button>
    </div>}
    <button disabled={busy} className="min-h-12 rounded-lg bg-primary px-5 py-3 text-white disabled:opacity-50" onClick={() => continueAsEmployer('/signup?role=employer&returnTo=%2Fmembers')}>Sign out and create an employer account</button>
    <button disabled={busy} className="mt-4 block min-h-12 text-primary underline disabled:opacity-50" onClick={() => continueAsEmployer('/login?returnTo=%2Fmembers')}>Sign in with an employer account</button>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
  </main>
}
