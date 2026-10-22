/** Small employer-only summary. Never a hiring verdict or a second message. */
import { safeResumeReviewV2, type ResumeReviewV2Score } from './review-v2'
export const REVIEW_V2_EMAIL_FOOTER = 'Based on the résumé, not independent verification. Confirm key details before making a hiring decision.'
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const scoreText = (score: ResumeReviewV2Score) => score.status === 'scored'
  ? `<strong>${score.value}/10</strong>` : 'Not rated: insufficient review scope'
export function resumeReviewV2EmailSection(input: unknown): string {
  const report = safeResumeReviewV2(input)
  if (!report) return '<p>Résumé review unavailable. Please review the original résumé.</p>'
  return `<section style="background:#f0fdfa;border:1px solid #99d5cf;border-radius:12px;padding:16px;margin:20px 0">
<h3 style="margin:0 0 10px;color:#0d7377">Résumé overview</h3>
<p style="margin:6px 0"><strong>Résumé quality:</strong> ${scoreText(report.qualityScore)}<br><strong>Résumé fit for this role:</strong> ${scoreText(report.roleFitScore)}</p>
<p style="margin:10px 0">${esc(report.overview.text)}</p>
${report.highlights.length ? `<p style="margin:10px 0 3px"><strong>Highlights</strong></p><ul style="margin:0;padding-left:20px">${report.highlights.map(item => `<li>${esc(item.text)}</li>`).join('')}</ul>` : ''}
${report.gaps.length ? `<p style="margin:10px 0 3px"><strong>Gaps for this role</strong></p><ul style="margin:0;padding-left:20px">${report.gaps.map(item => `<li>${esc(item.text)}${item.question ? ` ${esc(item.question)}` : ''}</li>`).join('')}</ul>` : ''}
<p style="font-size:12px;margin:12px 0 0">${report.coverage === 'partial' ? 'Partial text assessment. ' : ''}${REVIEW_V2_EMAIL_FOOTER}</p>
</section>`
}

/** Plain-text counterpart uses the same validated content, scores and footer. */
export function resumeReviewV2EmailText(input: unknown): string {
  const report = safeResumeReviewV2(input)
  if (!report) return 'Résumé review unavailable. Please review the original résumé.'
  const score = (value: ResumeReviewV2Score) => value.status === 'scored' ? `${value.value}/10` : 'Not rated: insufficient review scope'
  return ['Résumé overview', `Résumé quality: ${score(report.qualityScore)}`, `Résumé fit for this role: ${score(report.roleFitScore)}`,
    '', report.overview.text,
    ...(report.highlights.length ? ['', 'Highlights', ...report.highlights.map(item => `- ${item.text}`)] : []),
    ...(report.gaps.length ? ['', 'Gaps for this role', ...report.gaps.map(item => `- ${item.text}${item.question ? ` ${item.question}` : ''}`)] : []),
    '', `${report.coverage === 'partial' ? 'Partial text assessment. ' : ''}${REVIEW_V2_EMAIL_FOOTER}`].join('\n')
}
