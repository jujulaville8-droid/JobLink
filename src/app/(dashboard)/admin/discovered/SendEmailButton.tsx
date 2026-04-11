"use client"

import { useRef, useTransition } from "react"

interface SendEmailButtonProps {
  id: string
  email: string | null
  companyName: string
  action: (formData: FormData) => void | Promise<void>
}

export default function SendEmailButton({
  id,
  email,
  companyName,
  action,
}: SendEmailButtonProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (!email) {
      alert(
        `${companyName} has no email address. Add one manually or skip this one.`
      )
      return
    }
    const confirmed = window.confirm(
      `Send Email 1 to ${email}?\n\nCompany: ${companyName}\n\nThis will fire off a real email via Resend and mark the row as "sent". This action cannot be undone.`
    )
    if (!confirmed) return

    startTransition(() => {
      formRef.current?.requestSubmit()
    })
  }

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || !email}
        className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
          !email
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : isPending
            ? "bg-primary/40 text-white cursor-wait"
            : "bg-primary text-white hover:bg-primary-light"
        }`}
      >
        {!email ? "No email" : isPending ? "Sending..." : "Send Email 1"}
      </button>
    </form>
  )
}
