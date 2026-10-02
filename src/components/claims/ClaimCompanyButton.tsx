'use client'

import { useRef, useState } from 'react'

export default function ClaimCompanyButton({ token }: { token: string }) {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function claim() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/claim/${token}`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not claim this company. Please try again.')
      window.location.assign(result.redirectTo)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check your connection and try again.')
      inFlight.current = false
      setPending(false)
    }
  }
  return <div>
    <button type="button" onClick={claim} disabled={pending} className="btn-primary min-h-12 w-full disabled:opacity-60">{pending ? 'Claiming…' : 'Claim this company'}</button>
    <p className="mt-3 text-sm text-text-light">You’ll manage this company’s profile, jobs and applications.</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </div>
}
