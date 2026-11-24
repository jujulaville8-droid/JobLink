import { applicationScreeningLine } from '@/lib/employer-screening/not-screened'

const verdictClasses: Record<string, string> = {
  good_fit: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  not_a_fit: 'border border-red-200 bg-red-50 text-red-700',
  not_enough_information: 'border border-amber-200 bg-amber-50 text-amber-800',
}

export default function ApplicationScreeningVerdict({ application, recorded }: {
  application: { applied_at: string; employer_forward_status?: string | null }
  recorded?: { verdict: string; text: string }
}) {
  const colour = recorded?.text && Object.hasOwn(verdictClasses, recorded.verdict)
    ? verdictClasses[recorded.verdict]
    : 'bg-primary/5 text-text'
  return (
    <p className={`mt-2 rounded-lg p-3 text-sm ${colour}`}>
      {applicationScreeningLine(application, recorded?.text)}
    </p>
  )
}
