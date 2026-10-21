import { z } from 'zod'
import { resumeDocumentQualitySchema, resumeQualityFeedback } from './quality'

const boundedText = z.string().trim().min(1).max(1000)
const points = z.number().int().min(0).max(100)
const reportSchema = z.object({
  status: z.literal('scored'), rubricVersion: boundedText, supportedPoints: points,
  unresolvedPoints: points, evidenceCoverage: points,
  criteriaSource: z.literal('published_job_requirements').optional(), weighting: z.literal('equal').optional(),
  jobContextOmitted: z.boolean().optional(),
  criteria: z.array(z.object({
    label: boundedText, weight: z.number().int().min(1).max(100),
    finding: z.enum(['supported', 'contradicted', 'unknown']), verificationRequired: z.boolean(),
    evidence: z.array(z.object({ excerpt: boundedText, location: boundedText }).strict()).max(10),
  }).strict()).min(1).max(20),
}).strict().refine(r =>
  (r.criteriaSource === 'published_job_requirements') === (r.weighting === 'equal') &&
  (r.criteriaSource === 'published_job_requirements') === (r.jobContextOmitted !== undefined) &&
  (r.weighting !== 'equal' || Math.max(...r.criteria.map(c => c.weight)) - Math.min(...r.criteria.map(c => c.weight)) <= 1) &&
  r.criteria.reduce((n, c) => n + c.weight, 0) === 100 &&
  r.supportedPoints === r.criteria.reduce((n, c) => n + (c.finding === 'supported' ? c.weight : 0), 0) &&
  r.unresolvedPoints === r.criteria.reduce((n, c) => n + (c.finding === 'unknown' ? c.weight : 0), 0) &&
  r.evidenceCoverage === 100 - r.unresolvedPoints &&
  r.criteria.every(c => (c.finding === 'unknown') === (c.evidence.length === 0)),
)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Independent document presentation only. Unknown points never enter its denominator. */
export function resumeDocumentQualityEmailSection(input: unknown): string {
  const parsed = resumeDocumentQualitySchema.safeParse(input)
  if (!parsed.success) return '<h3>Résumé document presentation</h3><p>Document assessment unavailable. No document-quality score was assigned.</p>'
  const q = parsed.data
  return `<section style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:20px;margin:24px 0">
<h3 style="margin-top:0">Résumé document presentation (separate from job match)</h3>
<p style="font-size:20px;font-weight:bold">${q.observablePoints === 0 ? 'Document presentation not assessable' : `${q.supportedPoints}/${q.observablePoints} observable document-presentation points`}</p>
<p>${q.unknownPoints}/100 points unobservable or unresolved · Evidence coverage: ${q.evidenceCoverage}%</p>
<p>This describes observable text organization and evidence presentation, not the applicant’s ability, suitability or hiring prospects. Unknown dimensions are excluded from the score denominator. Visual design, grammar, native-language polish and career gaps are not graded.</p>
${q.dimensions.map(d => `<div style="border-top:1px solid #cbd5e1;padding:12px 0"><strong>${esc(d.label)}</strong><p>${d.observablePoints === 0 ? 'Unknown; not scored' : `${d.supportedPoints}/${d.observablePoints} observable points`} · ${d.unknownPoints} points unknown</p>${d.findings.map(f => `<p>${esc(resumeQualityFeedback(f.code))}${f.evidence.length ? `<br><small>${f.evidence.map(e => `${e.excerpt ? `“${esc(e.excerpt)}” · ` : ''}PDF page ${e.page}, characters ${e.start}–${e.end}`).join('; ')}</small>` : ''}</p>`).join('')}</div>`).join('')}
<p style="font-size:12px">Deterministic local text checks, not an AI prose-quality judgment. Fixed document rubric ${esc(q.rubricVersion)}. Review the original résumé; this separate assessment never changes the job-evidence score and never rejects or hides an application.</p></section>`
}
/** Validate again at the rendering boundary, including callers of the generic email template. */
export function screeningEmailSection(input: unknown): string {
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return '<h3>Application screening</h3><p>Screening unavailable; please review the résumé. No score was assigned.</p>'
  const report = parsed.data
  return `<section style="background:#f0fdfa;border:1px solid #99d5cf;border-radius:12px;padding:20px;margin:24px 0">
<h3 style="margin-top:0;color:#0d7377">Job-specific résumé screening</h3>
<p style="font-size:22px;font-weight:bold">${report.evidenceCoverage === 0 ? 'No job-specific evidence established' : `${report.supportedPoints}/100 points provisionally supported by AI-assessed résumé evidence`}</p>
<p>${report.unresolvedPoints} points unresolved · Evidence coverage: ${report.evidenceCoverage}%</p>
<p>${report.evidenceCoverage === 0 ? 'All requirements remain unresolved. No negative finding was established. ' : ''}Provisional evidence range: ${report.supportedPoints}–${report.supportedPoints + report.unresolvedPoints}/100. Missing evidence is unknown, not a failed requirement. This is not a probability of job success or a hiring recommendation.</p>
${report.criteria.map(c => `<div style="border-top:1px solid #c9e8e4;padding:12px 0"><strong>${esc(c.label)} (${c.weight} points)</strong><br>${c.finding === 'unknown' ? 'Not established in résumé' : c.finding === 'supported' ? 'Provisionally supported by AI-assessed, applicant-reported evidence' : 'Contradicted by applicant-reported evidence'}${c.verificationRequired ? '<br><strong>Employer verification required. This is a reported credential statement only; current validity, issuer and legal eligibility have not been established.</strong>' : ''}${c.evidence.map(e => `<p>“${esc(e.excerpt)}”<br><small>${esc(e.location)} · Applicant-reported; AI-assessed, not independently verified</small></p>`).join('')}${c.finding === 'unknown' ? '<p>Follow-up: ask the applicant for relevant evidence of this requirement.</p>' : ''}</div>`).join('')}
<p style="font-size:12px">AI-assisted evidence findings; points are calculated deterministically ${report.criteriaSource === 'published_job_requirements' ? 'using equally weighted explicit published job criteria' : `from the employer-approved rubric ${esc(report.rubricVersion)}`}. Use alongside the full résumé and an interview. The employer makes all hiring decisions. No application was rejected or hidden by this report.</p></section>`
}

/** Compact production summary; the original application header, contact details
 * and conditional CV-attachment statement belong to the surrounding email.
 * Rendering never invents a finding, recommendation, credential status or link.
 * Legacy detailed exports above remain available for existing callers.
 */
export function employerAdvisoryEmailSection(reportInput: unknown, qualityInput: unknown): string {
  let report: z.infer<typeof reportSchema> | null = null
  let quality: z.infer<typeof resumeDocumentQualitySchema> | null = null
  // Corrupt optional input must not prevent ordinary employer forwarding.
  try { const parsed = reportSchema.safeParse(reportInput); if (parsed.success) report = parsed.data } catch { /* unavailable */ }
  try { const parsed = resumeDocumentQualitySchema.safeParse(qualityInput); if (parsed.success) quality = parsed.data } catch { /* unavailable */ }

  // Very long/adversarial labels do not expand a compact summary indefinitely.
  // Substitute a truthful rubric-position reference rather than truncating a
  // requirement into a different meaning. Never use an unverified details URL.
  const labelFor = (label: string, index: number): string => {
    const escaped = esc(label.replace(/\s+/g, ' '))
    return escaped.length <= 180 ? escaped : `Job requirement ${index + 1}`
  }
  const criteria = report?.criteria.map((criterion, index) => ({ criterion, index }))
    .sort((a, b) => b.criterion.weight - a.criterion.weight || a.index - b.index) ?? []
  const strengths: string[] = [], prompts: string[] = []
  const strengthKeys = new Set<string>(), promptKeys = new Set<string>()
  const addPrompt = (key: string, text: string) => {
    if (prompts.length < 2 && !promptKeys.has(key)) { promptKeys.add(key); prompts.push(text) }
  }
  for (const { criterion, index } of criteria) {
    const key = criterion.label.toLowerCase()
    if (criterion.finding === 'supported' && strengths.length < 2 && !strengthKeys.has(key)) {
      strengthKeys.add(key); strengths.push(labelFor(criterion.label, index))
    }
    if (criterion.verificationRequired) {
      const label = labelFor(criterion.label, index)
      const prompt = criterion.finding === 'supported'
        ? `${label} · verify applicant-reported claim`
        : criterion.finding === 'unknown'
          ? `${label} · evidence needed`
          : `${label} · clarify conflicting evidence`
      addPrompt(`criterion:${key}`, prompt)
    }
  }
  if (quality) {
    const promptFor = {
      entry_placeholder: 'Review the unfilled role, project or credential field',
      task_placeholder: 'Review the unfilled task/evidence field',
      context_placeholder: 'Review the unfilled professional-context field',
    } as const
    for (const dimension of quality.dimensions) for (const observation of dimension.findings) {
      if (observation.status !== 'needs_attention' || !Object.hasOwn(promptFor, observation.code)) continue
      const text = promptFor[observation.code as keyof typeof promptFor]
      const page = observation.evidence[0]?.page
      addPrompt(`quality:${observation.code}`, `${text}${page ? ` (PDF page ${page})` : ''}.`)
    }
  }
  for (const { criterion, index } of criteria) {
    if (criterion.finding === 'unknown') {
      addPrompt(`criterion:${criterion.label.toLowerCase()}`, `${labelFor(criterion.label, index)} · evidence needed`)
    }
  }

  const contradictedPoints = report ? 100 - report.supportedPoints - report.unresolvedPoints : 0
  const jobSummary = !report ? 'Job match unavailable. No score was assigned.'
    : report.evidenceCoverage === 0
      ? 'No job-specific evidence established · 100 points unresolved.'
      : `<strong>${report.supportedPoints}/100</strong> evidence points · ${report.unresolvedPoints} unresolved${contradictedPoints ? ` · ${contradictedPoints} contradicted` : ''}`
  // Keep the fixed whole-rubric denominator: unknown checks must not inflate a
  // partial assessment to 10/10. This is supported presentation evidence only;
  // the internal report and its observed/unknown point totals remain unchanged.
  const presentationScore = quality && quality.observablePoints > 0
    ? `<strong>${Number((quality.supportedPoints / 10).toFixed(3))}/10</strong> supported`
    : 'Not assessed'
  const presentationNotes: string[] = []
  if (quality && quality.observablePoints > 0) {
    const observations = quality.dimensions.flatMap(dimension => dimension.findings)
    const noteLimit = quality.unknownPoints > 0 ? 1 : 2
    const noteFor = {
      entry_placeholder: 'Unfilled entry field',
      task_placeholder: 'Unfilled task field',
      context_placeholder: 'Unfilled context field',
      section_identified: 'Recognizable sections',
      task_presented: 'Task details present',
      entry_identified: 'Professional entry identified',
      context_identified: 'Task linked to entry',
    } as const
    for (const code of Object.keys(noteFor) as (keyof typeof noteFor)[]) {
      if (presentationNotes.length >= noteLimit) break
      const observation = observations.find(item => item.code === code && item.status !== 'unknown' && item.evidence.length > 0)
      // A detailed prompt already names this issue; do not repeat it here.
      if (!observation || promptKeys.has(`quality:${code}`)) continue
      presentationNotes.push(noteFor[code])
    }
    if (quality.unknownPoints > 0) presentationNotes.push('Some checks not assessed')
  }
  const qualitySummary = [presentationScore, ...presentationNotes].join(' · ')
  const qualityCaption = `Rule-based presentation checks${quality && quality.observablePoints > 0 && quality.unknownPoints > 0 ? ' · Partial assessment' : ''}`
  return `<section style="background:#f0fdfa;border:1px solid #99d5cf;border-radius:12px;padding:16px;margin:20px 0">
<h3 style="margin:0 0 12px;color:#0d7377">Résumé advisory summary</h3>
<p style="margin:8px 0"><strong>Résumé presentation:</strong> ${qualitySummary}<br><small>${qualityCaption}</small></p>
${strengths.length ? `<p style="margin:12px 0 4px"><strong>Highlights</strong></p><ul style="margin:0;padding-left:20px">${strengths.map(text => `<li>${text}</li>`).join('')}</ul>` : ''}
${prompts.length ? `<p style="margin:12px 0 4px"><strong>To verify</strong></p><ul style="margin:0;padding-left:20px">${prompts.map(text => `<li>${text}</li>`).join('')}</ul>` : ''}
<p style="margin:8px 0"><strong>Job match:</strong> ${jobSummary}${report ? `<br><small>Unverified résumé evidence${report.criteriaSource === 'published_job_requirements' ? ` · Published job criteria, equal weights${report.jobContextOmitted ? ' · Partial scope' : ''}` : ''}</small>` : ''}</p>
<p style="font-size:12px;margin:12px 0 0">Advisory only. Verify against the original résumé; you make the decision.</p>
</section>`
}
