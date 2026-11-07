import type { Metadata } from 'next'
import ResetConfirmForm from './reset-confirm-form'

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: true },
}

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }>
}) {
  const { token_hash: tokenHash, type } = await searchParams
  const valid = typeof tokenHash === 'string' && !!tokenHash && type === 'recovery'

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-start px-4 pt-16 pb-12">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-card shadow-md border border-border p-8 text-center">
          {valid ? (
            <>
              <h1 className="font-display text-2xl text-text mb-2">Reset your password</h1>
              <p className="text-sm text-text-light mb-6">
                Tap the button below to continue setting your new password.
              </p>
              <ResetConfirmForm tokenHash={tokenHash} />
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl text-text mb-2">Invalid reset link</h1>
              <p className="text-sm text-text-light mb-6">
                This reset link is invalid. Please request a new one.
              </p>
              <a href="/forgot-password" className="inline-block w-full btn-primary">
                Request a new reset link
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
