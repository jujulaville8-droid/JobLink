'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Closing always goes through the admin PATCH route so applicant closure emails are sent.
export default function CloseListingButton({ jobId, isFeatured, onClosed }: {
  jobId: string
  isFeatured: boolean
  onClosed?: () => void
}) {
  const router = useRouter()
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || closing) return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closing])

  function dismiss() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  async function confirmClose() {
    setClosing(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/listings/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFeatured ? { status: 'closed', is_featured: false } : { status: 'closed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not close this listing. Please try again.')
      setOpen(false)
      setClosed(true)
      onClosed?.()
      router.refresh()
    } catch (err) {
      setOpen(false)
      setError(err instanceof Error && err.message ? err.message : 'Could not close this listing. Please try again.')
    } finally {
      setClosing(false)
    }
  }

  if (closed) return <p role="status" className="text-sm text-emerald-700">Listing closed, applicant emails sent</p>

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setError(''); setOpen(true) }}
        className="px-4 py-1.5 border border-red-200 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
      >
        Close listing
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-2xl border border-border shadow-xl max-w-sm w-full p-6">
            <p id={titleId} className="text-sm text-text mb-5">Close this listing? Applicants will be emailed that it&apos;s closed.</p>
            <div className="flex justify-end gap-2.5">
              <button
                ref={cancelRef}
                type="button"
                onClick={dismiss}
                disabled={closing}
                className="px-4 py-2 border border-border text-text-light text-sm font-medium rounded-lg hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClose}
                disabled={closing}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {closing ? 'Closing…' : 'Close listing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
