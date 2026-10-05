'use client'

import { useRef, useState } from 'react'

export default function CopyClaimLinkButton({ companyId }: { companyId: string }) {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [url, setUrl] = useState('')
  const [message, setMessage] = useState('')
  async function copy() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setMessage('')
    try {
      let link = url
      if (!link) {
        const response = await fetch('/api/admin/company-claims', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not create a claim link.')
        link = data.url
        setUrl(link)
      }
      try {
        await navigator.clipboard.writeText(link)
        setMessage('Copied. Send privately to the verified employer contact. Expires in 30 days.')
      } catch {
        setMessage('Select and copy the link below. Send privately to the verified employer contact. Expires in 30 days.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create a claim link. Try again.')
    } finally { busy.current = false; setPending(false) }
  }
  return <div className="space-y-2">
    <button className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary disabled:opacity-60" disabled={pending} type="button" onClick={copy}>{pending ? 'Creating link…' : 'Copy claim link'}</button>
    {message && <p role="status" className="max-w-sm text-sm text-text-light">{message}</p>}
    {url && <input aria-label="Claim link" className="w-full rounded border border-border p-2 text-sm" readOnly value={url} onFocus={event => event.currentTarget.select()} />}
  </div>
}
