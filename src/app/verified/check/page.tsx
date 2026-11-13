import { notFound, redirect } from 'next/navigation'
import { verificationEnabled } from '@/lib/verification/server'
import { parseConfirmationCode } from '@/lib/verification/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Check a JobLink verification code', robots: { index: false } }

export default async function CheckCodePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  if (!verificationEnabled()) notFound()
  const { code } = await searchParams
  const parsed = parseConfirmationCode(code)
  if (parsed) redirect(`/verified/check/${parsed}`)
  return (
    <div className="mx-auto min-h-[60vh] max-w-md px-4 py-16">
      <h1 className="font-display text-2xl font-bold text-text">Check a verification code</h1>
      <p className="mt-2 text-text-light">Enter the code from a JobLink right-to-work confirmation to check it is genuine.</p>
      <form method="get" className="mt-6">
        <label htmlFor="code" className="text-sm font-medium text-text">Verification code</label>
        <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14}
          defaultValue={typeof code === 'string' ? code.slice(0, 14) : ''} placeholder="ABCDE-FGH23"
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 font-mono text-lg uppercase tracking-wider text-text" />
        {code !== undefined && <p className="mt-2 text-sm text-red-700" role="alert">That doesn&apos;t look like a JobLink code. Codes are 10 letters and numbers.</p>}
        <button type="submit" className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white">Check code</button>
      </form>
    </div>
  )
}
