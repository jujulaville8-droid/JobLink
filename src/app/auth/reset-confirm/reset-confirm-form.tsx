'use client'

import { useRef, useState } from 'react'

export default function ResetConfirmForm({ tokenHash }: { tokenHash: string }) {
  const submitted = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form method="post" action="/auth/reset-confirm/verify" onSubmit={event => {
      if (submitted.current) {
        event.preventDefault()
        return
      }
      submitted.current = true
      setIsSubmitting(true)
    }}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value="recovery" />
      <button type="submit" className="w-full btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Continuing...' : 'Continue to set a new password'}
      </button>
    </form>
  )
}
