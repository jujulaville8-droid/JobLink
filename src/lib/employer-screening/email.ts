import { z } from 'zod'

const boundedText = z.string().trim().min(1).max(1000)
const points = z.number().int().min(0).max(100)
const reportSchema = z.object({
  status: z.literal('scored'), rubricVersion: boundedText, supportedPoints: points,
  unresolvedPoints: points, evidenceCoverage: points,
  criteria: z.array(z.object({
    label: boundedText, weight: z.number().int().min(1).max(100),
    finding: z.enum(['supported', 'contradicted', 'unknown']), verificationRequired: z.boolean(),
    evidence: z.array(z.object({ excerpt: boundedText, location: boundedText }).strict()).max(10),
  }).strict()).min(1).max(20),
}).strict().refine(r =>
  r.criteria.reduce((n, c) => n + c.weight, 0) === 100 &&
  r.supportedPoints === r.criteria.reduce((n, c) => n + (c.finding === 'supported' ? c.weight : 0), 0) &&
  r.unresolvedPoints === r.criteria.reduce((n, c) => n + (c.finding === 'unknown' ? c.weight : 0), 0) &&
  r.evidenceCoverage === 100 - r.unresolvedPoints &&
  r.criteria.every(c => (c.finding === 'unknown') === (c.evidence.length === 0)),
)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Validate again at the rendering boundary, including callers of the generic email template. */
export function screeningEmailSection(input: unknown): string {
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return '<h3>Application screening</h3><p>Screening unavailable; please review the résumé. No score was assigned.</p>'
  const report = parsed.data
  return `<section style="background:#f0fdfa;border:1px solid #99d5cf;border-radius:12px;padding:20px;margin:24px 0">
<h3 style="margin-top:0;color:#0d7377">Job-specific résumé screening</h3>
<p style="font-size:22px;font-weight:bold">${report.supportedPoints}/100 points supported by résumé evidence</p>
<p>${report.unresolvedPoints} points unresolved · Evidence coverage: ${report.evidenceCoverage}%</p>
<p>Provisional evidence range: ${report.supportedPoints}–${report.supportedPoints + report.unresolvedPoints}/100. Missing evidence is unknown, not a failed requirement. This is not a probability of job success or a hiring recommendation.</p>
${report.criteria.map(c => `<div style="border-top:1px solid #c9e8e4;padding:12px 0"><strong>${esc(c.label)} (${c.weight} points)</strong><br>${c.finding === 'unknown' ? 'Not established in résumé' : c.finding === 'supported' ? 'Supported by applicant-reported evidence' : 'Contradicted by applicant-reported evidence'}${c.verificationRequired ? '<br><strong>Employer verification required; this report does not verify the credential.</strong>' : ''}${c.evidence.map(e => `<p>“${esc(e.excerpt)}”<br><small>${esc(e.location)} · Applicant-reported, not independently verified</small></p>`).join('')}${c.finding === 'unknown' ? '<p>Follow-up: ask the applicant for relevant evidence of this requirement.</p>' : ''}</div>`).join('')}
<p style="font-size:12px">Rubric ${esc(report.rubricVersion)}. Use alongside the full résumé and an interview. The employer makes all hiring decisions. No application was rejected or hidden by this report.</p></section>`
}
