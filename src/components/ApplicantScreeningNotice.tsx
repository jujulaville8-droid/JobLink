import { SCREENING_NOTICE_TEXT, SCREENING_NOTICE_VERSION } from '@/lib/employer-screening/notice'

export default function ApplicantScreeningNotice({ visible = false }: { visible?: boolean }) {
  if (!visible) return null
  return <aside role="note" aria-label="Application processing notice" data-screening-notice-version={SCREENING_NOTICE_VERSION}
    className="rounded-xl border border-border bg-[--color-surface] p-4 text-sm text-text-muted">
    <h3 className="mb-2 font-semibold text-text">How your application may be reviewed</h3>
    <p>{SCREENING_NOTICE_TEXT}</p>
  </aside>
}
