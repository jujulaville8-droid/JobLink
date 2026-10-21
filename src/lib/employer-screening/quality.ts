/**
 * Local-only, deterministic document-presentation observations. This module does
 * not assess a person's merit, writing proficiency, suitability or truthfulness.
 * Pages stay transient: reports contain fixed codes and exact UTF-16 spans only.
 * The trusted capture caller must bind localPages and expectedSourceSha256 to the
 * same parsed PDF bytes. A caller-supplied hash alone is not proof of that binding.
 */
import { z } from 'zod'
import { canonicalScreeningEvidence } from './privacy'

export const RESUME_QUALITY_RUBRIC_VERSION = 'resume-document-quality-v1' as const
export const RESUME_QUALITY_LIMITS = Object.freeze({
  pages: 20, pageCharacters: 30_000, totalCharacters: 120_000,
  lines: 10_000, sections: 40, entries: 80, fields: 400,
  fieldCharacters: 2_000, findingsPerDimension: 80, reportNodes: 8_000,
})

const definitions = [
  { id: 'organization', label: 'Text organization' },
  { id: 'entry_completeness', label: 'Provided-entry identification' },
  { id: 'task_evidence', label: 'Task/evidence presentation' },
  { id: 'traceability', label: 'Professional entry context' },
] as const
export type ResumeQualityDimensionId = typeof definitions[number]['id']

const feedback = {
  section_identified: 'An explicit professional section heading is present. Visual layout and reading order were not assessed.',
  organization_unknown: 'Text organization is unobservable in the supported local format. No missing-section deduction was made.',
  entry_identified: 'A recognizable professional role, project or credential is presented with organizational context. Its accuracy and prestige were not assessed.',
  entry_placeholder: 'A provided entry contains an explicit unfilled identifier placeholder. Review that template field without inventing information.',
  entry_unknown: 'The identifier of this entry could not be assessed. Missing or unsupported fields are unknown, not incomplete.',
  task_presented: 'A description/evidence item is explicitly associated with a provided entry. Prose quality, achievements and numerical results were not graded.',
  task_placeholder: 'A provided task or evidence field contains an explicit unfilled template placeholder. Review it using only information the applicant supplies.',
  task_unknown: 'Task/evidence presentation could not be assessed in the supported format. No requirement for accomplishments or metrics was imposed.',
  context_identified: 'A concrete professional statement is linked to an identified entry and organizational context. Dates, prestige and external verification were not assessed.',
  context_placeholder: 'A provided entry contains an explicit unfilled professional-context placeholder. Review that field without requesting personal contact details.',
  context_unknown: 'Professional context could not be linked to an identified entry. Missing employers, dates, links and contact details were not penalized.',
} as const
export type ResumeQualityFeedbackCode = keyof typeof feedback
export function resumeQualityFeedback(code: ResumeQualityFeedbackCode): string { return feedback[code] }

const allowedCodes: Record<ResumeQualityDimensionId, readonly ResumeQualityFeedbackCode[]> = {
  organization: ['section_identified', 'organization_unknown'],
  entry_completeness: ['entry_identified', 'entry_placeholder', 'entry_unknown'],
  task_evidence: ['task_presented', 'task_placeholder', 'task_unknown'],
  traceability: ['context_identified', 'context_placeholder', 'context_unknown'],
}
const codeStatus = (code: ResumeQualityFeedbackCode) => code.endsWith('_unknown') ? 'unknown' as const
  : code.endsWith('_placeholder') ? 'needs_attention' as const : 'supported' as const
const round = (value: number) => Math.round(value * 100) / 100
const spanSchema = z.object({
  page: z.number().int().min(1).max(RESUME_QUALITY_LIMITS.pages),
  start: z.number().int().min(0).max(RESUME_QUALITY_LIMITS.pageCharacters - 1),
  end: z.number().int().min(1).max(RESUME_QUALITY_LIMITS.pageCharacters),
  excerpt: z.string().min(1).max(160).optional(),
}).strict().refine(span => span.end > span.start && (span.excerpt === undefined ||
  (span.excerpt.length === span.end - span.start && isSafeExcerpt(span.excerpt))))
export type ResumeQualitySpan = z.infer<typeof spanSchema>
const findingSchema = z.object({
  code: z.enum(Object.keys(feedback) as [ResumeQualityFeedbackCode, ...ResumeQualityFeedbackCode[]]),
  status: z.enum(['supported', 'needs_attention', 'unknown']),
  evidence: z.array(spanSchema).max(3),
}).strict().superRefine((finding, ctx) => {
  if (finding.status !== codeStatus(finding.code) ||
      (finding.status !== 'unknown' && !finding.evidence.length) ||
      new Set(finding.evidence.map(spanKey)).size !== finding.evidence.length) {
    ctx.addIssue({ code: 'custom', message: 'Invalid quality observation' })
  }
})
export type ResumeQualityFinding = z.infer<typeof findingSchema>
const points = z.number().min(0).max(100).refine(value => Number.isFinite(value) && round(value) === value)
const dimensionSchema = z.object({
  id: z.enum(['organization', 'entry_completeness', 'task_evidence', 'traceability']),
  label: z.string().min(1).max(60), maxPoints: z.literal(25),
  supportedPoints: points, observablePoints: points, unknownPoints: points,
  findings: z.array(findingSchema).min(1).max(RESUME_QUALITY_LIMITS.findingsPerDimension),
}).strict().superRefine((dimension, ctx) => {
  const definition = definitions.find(item => item.id === dimension.id)!
  const score = tally(dimension.findings)
  if (dimension.label !== definition.label || dimension.findings.some(f => !allowedCodes[dimension.id].includes(f.code)) ||
      dimension.supportedPoints !== score.supportedPoints || dimension.observablePoints !== score.observablePoints ||
      dimension.unknownPoints !== score.unknownPoints) ctx.addIssue({ code: 'custom', message: 'Invalid quality dimension' })
})

/** Bound hostile persisted objects before schema traversal; never stringify input. */
function boundedReport(input: unknown): boolean {
  let nodes = 0, characters = 0
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > RESUME_QUALITY_LIMITS.reportNodes || depth > 10) return false
    if (typeof value === 'string') { characters += value.length; return value.length <= 200 && characters <= 40_000 }
    if (typeof value === 'number') return Number.isFinite(value)
    if (value === null || typeof value === 'boolean') return true
    if (typeof value !== 'object') return false
    if (Array.isArray(value)) {
      if (value.length > RESUME_QUALITY_LIMITS.findingsPerDimension) return false
      for (let i = 0; i < value.length; i++) {
        const item = Object.getOwnPropertyDescriptor(value, String(i))
        if (!item || !('value' in item) || !visit(item.value, depth + 1)) return false
      }
      return true
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
    const keys = Object.keys(value)
    if (keys.length > 16) return false
    for (const key of keys) {
      const item = Object.getOwnPropertyDescriptor(value, key)
      if (key.length > 40 || !item || !('value' in item) || !visit(item.value, depth + 1)) return false
    }
    return true
  }
  try { return visit(input, 0) } catch { return false }
}
const reportSchema = z.object({
  status: z.literal('assessed'), kind: z.literal('resume_document_quality'),
  rubricVersion: z.literal(RESUME_QUALITY_RUBRIC_VERSION), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  supportedPoints: points, observablePoints: points, unknownPoints: points, evidenceCoverage: points,
  dimensions: z.array(dimensionSchema).length(4),
}).strict().superRefine((report, ctx) => {
  const sum = (key: 'supportedPoints' | 'observablePoints' | 'unknownPoints') => round(report.dimensions.reduce((n, d) => n + d[key], 0))
  if (report.dimensions.some((dimension, index) => dimension.id !== definitions[index].id) ||
      report.supportedPoints !== sum('supportedPoints') || report.observablePoints !== sum('observablePoints') ||
      report.unknownPoints !== sum('unknownPoints') || round(report.observablePoints + report.unknownPoints) !== 100 ||
      report.evidenceCoverage !== report.observablePoints) ctx.addIssue({ code: 'custom', message: 'Invalid quality totals' })
})
export const resumeDocumentQualitySchema = z.preprocess((input, ctx) => {
  if (!boundedReport(input)) { ctx.addIssue({ code: 'custom', message: 'Quality report limit' }); return z.NEVER }
  return input
}, reportSchema)
export type ResumeDocumentQuality = z.infer<typeof resumeDocumentQualitySchema>
export type ResumeDocumentQualityResult = ResumeDocumentQuality | { status: 'unavailable' }

export function validateResumeDocumentQuality(input: unknown, expectedSourceSha256: string): ResumeDocumentQuality {
  const result = resumeDocumentQualitySchema.parse(input)
  if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256) || result.sourceSha256 !== expectedSourceSha256) {
    throw new Error('Quality source mismatch')
  }
  return result
}

function spanKey(span: ResumeQualitySpan): string { return `${span.page}:${span.start}:${span.end}` }
function tally(findings: readonly ResumeQualityFinding[]) {
  const supportedPoints = round(25 * findings.filter(f => f.status === 'supported').length / findings.length)
  const observablePoints = round(25 * findings.filter(f => f.status !== 'unknown').length / findings.length)
  return { supportedPoints, observablePoints, unknownPoints: round(25 - observablePoints) }
}

type SectionKind = 'experience' | 'projects' | 'volunteering' | 'credentials' | 'education' | 'skills'
type FieldKind = 'identifier' | 'task' | 'context'
type Field = { kind: FieldKind; span: ResumeQualitySpan; state: 'present' | 'placeholder' | 'unknown' }
type Entry = { fields: Field[]; anchor: ResumeQualitySpan }
type Section = { kind: SectionKind; heading: ResumeQualitySpan; entries: Entry[]; uncertainTasks?: boolean; pendingContext?: Entry; unresolvedEntry?: Entry }
const headings: Readonly<Record<string, SectionKind>> = Object.freeze({
  experience: 'experience', 'work experience': 'experience', 'professional experience': 'experience', 'employment history': 'experience',
  projects: 'projects', 'selected projects': 'projects', 'project experience': 'projects',
  volunteering: 'volunteering', 'volunteer experience': 'volunteering',
  certifications: 'credentials', certificates: 'credentials', credentials: 'credentials', licenses: 'credentials', qualifications: 'credentials',
  education: 'education', training: 'education',
  skills: 'skills', 'technical skills': 'skills', 'professional skills': 'skills', 'key skills': 'skills', 'core skills': 'skills',
})
// Contact, references, dates, nationality, age, languages and other personal fields
// are deliberately absent. Values never affect points by vocabulary or prestige.
const labels: Readonly<Record<string, FieldKind>> = Object.freeze({
  role: 'identifier', position: 'identifier', 'job title': 'identifier', project: 'identifier', 'project name': 'identifier',
  credential: 'identifier', certificate: 'identifier', certification: 'identifier', qualification: 'identifier', degree: 'identifier', course: 'identifier',
  task: 'task', tasks: 'task', responsibilities: 'task', duties: 'task', contribution: 'task', contributions: 'task',
  description: 'task', evidence: 'task', outcome: 'task', outcomes: 'task', coursework: 'task',
  organization: 'context', employer: 'context', 'project context': 'context', issuer: 'context',
  'issuing organization': 'context', institution: 'context',
})
const identifierLabels: Readonly<Record<Exclude<SectionKind, 'skills'>, readonly string[]>> = Object.freeze({
  experience: ['role', 'position', 'job title'], volunteering: ['role', 'position', 'job title'],
  projects: ['project', 'project name'], credentials: ['credential', 'certificate', 'certification', 'qualification', 'course'],
  education: ['qualification', 'degree', 'course'],
})
const contextLabels: Readonly<Record<Exclude<SectionKind, 'skills'>, readonly string[]>> = Object.freeze({
  experience: ['organization', 'employer'], volunteering: ['organization'], projects: ['organization', 'project context'],
  credentials: ['issuer', 'issuing organization', 'institution'], education: ['institution'],
})
const nonobservations = /^(?:x+|tbd|todo|test|placeholder|n\/?a|none|unknown|not (?:provided|applicable|disclosed)|redacted|withheld|[-–—?.]+)$/i
function reviewedHeading(value: string): SectionKind | undefined {
  if (Object.hasOwn(headings, value)) return headings[value]
  // React-PDF's letter-spaced heading extracts as literal spaced characters.
  // Compare against finite reviewed variants; never normalize applicant prose.
  return Object.entries(headings).find(([label]) => [...label].join(' ') === value)?.[1]
}
function isSafeExcerpt(value: string): boolean {
  const key = value.replace(/:$/, '').toLowerCase()
  if (reviewedHeading(key) || (value.endsWith(':') && Object.hasOwn(labels, key)) || concreteTaskPrefix(value) === value) return true
  const match = /^([A-Za-z][A-Za-z ]{0,39}):[ \t]*(\[(?:add|enter|insert) [a-z ]{1,40}\])$/i.exec(value)
  return Boolean(match && Object.hasOwn(labels, match[1].toLowerCase()) && stateOf(match[2], match[1].toLowerCase()) === 'placeholder')
}

// Only explicit template directives count as an observed issue. Blank fields,
// unsupported prose, deliberate omission and generic bracketed text stay unknown.
function stateOf(value: string, label: string): Field['state'] {
  if (!value || nonobservations.test(value)) return 'unknown'
  const placeholder = /^\[(?:add|enter|insert) ([a-z ]{1,40})\]$/i.exec(value)
  if (placeholder) {
    const target = placeholder[1].toLowerCase()
    return target === label || target === `your ${label}` ? 'placeholder' : 'unknown'
  }
  if (/^[\[{<].*[\]}>]$/.test(value)) return 'unknown'
  return 'present'
}

const roleNames = new Set([
  'office assistant', 'administrative assistant', 'office administrator', 'administrator', 'receptionist', 'secretary', 'bookkeeper', 'accountant',
  'accounts clerk', 'data entry clerk', 'inventory clerk', 'stock clerk', 'storekeeper', 'warehouse assistant', 'sales assistant', 'cashier',
  'customer service representative', 'customer service assistant', 'customer support agent', 'front desk agent', 'front desk clerk',
  'front desk receptionist', 'guest services agent', 'reservations agent', 'hotel receptionist', 'housekeeper', 'room attendant',
  'waiter', 'waitress', 'server', 'food server', 'bartender', 'barista', 'chef', 'cook', 'kitchen assistant', 'cleaner',
  'electrician', 'maintenance electrician', 'electrical technician', 'electrical apprentice', 'plumber', 'plumbing assistant',
  'carpenter', 'mason', 'painter', 'maintenance technician', 'maintenance assistant', 'construction worker', 'general labourer',
  'general laborer', 'air conditioning technician', 'refrigeration technician', 'mechanic', 'driver', 'delivery driver',
  'office manager', 'hotel manager', 'restaurant manager', 'supervisor', 'project coordinator', 'volunteer coordinator', 'volunteer',
])
const unsupportedTaskContext = /\b(?:no|not|never|without|cannot|can't|didn't|don't|would|could|might|if|unless|wish|want|aspire|hope|seeking|hypothetical|ignore|instructions?|prompt|override|scor(?:e|ing)|rank(?:ing)?|shortlist)\b|[<>\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/i
// Reviewed local action/object grammar. These tokens establish only that a
// concrete work statement is presented, not proficiency or a job-match claim.
// Qualifiers/names after the prefix are never quoted or sent to any provider.
const taskPatterns = [
  /^(?:scheduled|coordinated|managed) (?:(?:client|customer|patient|guest|staff) )?(?:appointments|reservations|bookings|calendars|shifts|rosters)\b/i,
  /^(?:maintained|updated|prepared|processed|recorded|reconciled|organized|organised|filed|entered|archived) (?:(?:weekly|monthly|daily|electronic|paper|customer|client|supplier|purchase|invoice|financial|inventory|stock|office|Excel|Microsoft Excel|database|business) ){0,3}(?:records|invoices|orders|reports|documents|files|filing systems|accounts|payments|transactions|spreadsheets)\b/i,
  /^(?:tested|inspected) (?:electrical )?(?:circuits|wiring|equipment)\b/i,
  /^documented (?:electrical )?faults\b/i,
  /^read electrical drawings\b/i,
  /^followed lockout\/tagout procedures\b/i,
  /^coordinated room readiness\b/i,
] as const
function concreteTaskPrefix(value: string): string | null {
  if (!value || value.length > RESUME_QUALITY_LIMITS.fieldCharacters || unsupportedTaskContext.test(value)) return null
  const whole = canonicalScreeningEvidence(value, 'relevant_experience') || canonicalScreeningEvidence(value, 'job_certification')
  if (whole) return value
  for (const pattern of taskPatterns) {
    const match = pattern.exec(value)
    if (match && validTaskSuffix(value.slice(match[0].length))) return match[0]
  }
  // A complete reviewed proposition may be followed by an explicit modifier or
  // another clause. Never cherry-pick a keyword from the middle of arbitrary text.
  const cuts = [...value.matchAll(/(?=,|;|\. | and | with | using | for | to | at | in | on | following | according to )/gi)].map(match => match.index ?? 0)
  for (const end of cuts) {
    const prefix = value.slice(0, end)
    if (prefix.length <= 120 && canonicalScreeningEvidence(prefix, 'relevant_experience') && validTaskSuffix(value.slice(end))) return prefix
  }
  return null
}
function validTaskSuffix(suffix: string): boolean {
  return !suffix || /^[.]$/.test(suffix) || /^(?:[,;.] | and | with | using | for | to | at | in | on | following | according to )\S/i.test(suffix)
}
function meaningfulIdentifier(value: string, kind: Exclude<SectionKind, 'skills'>): boolean {
  if (nonobservations.test(value) || unsupportedTaskContext.test(value)) return false
  if (kind === 'experience' || kind === 'volunteering') return roleNames.has(value.toLowerCase())
  if (kind === 'projects') return /^(?:(?:spreadsheet|inventory|stock|customer|appointment|invoice|electrical|plumbing|community) )?(?:tracker|database|website|filing system|maintenance project|repair project|installation project)$/i.test(value)
  return /^(?:(?:first aid|CPR|food safety|food handler|occupational health and safety|electrical installation|plumbing|business administration|bookkeeping)(?: and (?:CPR|first aid))? (?:certificate|certification|diploma)|(?:certificate|certification|diploma|degree|NVQ Level [1-5]) (?:in )?(?:first aid|CPR|food safety|electrical installation|plumbing|business administration|bookkeeping))$/i.test(value)
}
function meaningfulContext(value: string): boolean {
  return value.length >= 2 && value.length <= 160 && !nonobservations.test(value) && !/[:@<>]/.test(value) &&
    !/^(?:age|gender|sex|religion|nationality|phone|email|contact)\b/i.test(value) && /[\p{L}]/u.test(value)
}

function boundedPages(input: unknown, expectedSourceSha256: string): { sourceSha256: string; localPages: string[] } | null {
  try {
    if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256) || input === null || typeof input !== 'object' || Array.isArray(input) ||
        (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) return null
    const keys = Object.keys(input)
    if (keys.length !== 2 || !keys.includes('sourceSha256') || !keys.includes('localPages')) return null
    const hash = Object.getOwnPropertyDescriptor(input, 'sourceSha256'), pages = Object.getOwnPropertyDescriptor(input, 'localPages')
    if (!hash || !('value' in hash) || hash.value !== expectedSourceSha256 || !pages || !('value' in pages) || !Array.isArray(pages.value) ||
        !pages.value.length || pages.value.length > RESUME_QUALITY_LIMITS.pages) return null
    const localPages: string[] = []
    let characters = 0
    for (let i = 0; i < pages.value.length; i++) {
      const page = Object.getOwnPropertyDescriptor(pages.value, String(i))
      if (!page || !('value' in page) || typeof page.value !== 'string' || page.value.length > RESUME_QUALITY_LIMITS.pageCharacters) return null
      characters += page.value.length
      if (characters > RESUME_QUALITY_LIMITS.totalCharacters) return null
      localPages.push(page.value)
    }
    if (!localPages.some(page => /\S/u.test(page))) return null
    return { sourceSha256: hash.value, localPages }
  } catch { return null }
}

/** Strict labels are a supported local format, not a recommended resume template.
 * Ordinary prose, unfamiliar headings, multiline fields and cross-page joins are
 * not guessed. Recognizing a label never proves the value is a true qualification.
 */
function observePages(pages: readonly string[]): Section[] | null {
  const sections: Section[] = []
  let lineCount = 0, fieldCount = 0, entryCount = 0
  for (const [pageIndex, page] of pages.entries()) {
    let active: Section | undefined, offset = 0
    const detachUnknown = (span: ResumeQualitySpan): boolean => {
      if (!active || active.kind === 'skills') return true
      active.pendingContext = undefined
      if (active.unresolvedEntry) return true
      if (++entryCount > RESUME_QUALITY_LIMITS.entries) return false
      const entry: Entry = { fields: [], anchor: span }
      active.entries.push(entry); active.unresolvedEntry = entry
      return true
    }
    for (const line of page.split('\n')) {
      if (++lineCount > RESUME_QUALITY_LIMITS.lines) return null
      const startPadding = line.length - line.trimStart().length
      const text = line.trim()
      const span = { page: pageIndex + 1, start: offset + startPadding, end: offset + startPadding + text.length }
      offset += line.length + 1
      if (!text) continue
      const heading = text.replace(/:$/, '').toLowerCase()
      const kind = reviewedHeading(heading)
      if (kind) {
        if (sections.length >= RESUME_QUALITY_LIMITS.sections) return null
        active = { kind, heading: { ...span, excerpt: text }, entries: [] }
        sections.push(active)
        continue
      }
      if (['summary', 'profile', 'objective', 'languages', 'references', 'awards', 'memberships', 'contact', 'contact information', 'personal information', 'personal details', 'interests', 'hobbies'].some(label => label === heading || [...label].join(' ') === heading)) { active = undefined; continue }
      // Unknown heading-looking lines end the section instead of associating
      // personal fields or another section with a preceding professional entry.
      if (/^[A-Za-z][A-Za-z &/-]{0,59}:$/.test(text) && !Object.hasOwn(labels, text.slice(0, -1).toLowerCase())) { if (!detachUnknown(span)) return null; active = undefined; continue }
      if (!active || active.kind === 'skills') continue
      if (text.length > RESUME_QUALITY_LIMITS.fieldCharacters) return null
      // Dates/footer markers do not identify a new entry and earn no points.
      if (isDateLine(text) || /^\d{1,2} ?\/ ?\d{1,2}$/.test(text)) { active.pendingContext = undefined; continue }
      const personalField = /^([^:]{1,40}):/.exec(text)
      if (personalField && privateLabels.test(personalField[1])) continue
      if (unsupportedTaskContext.test(text)) {
        active.uncertainTasks = true
        for (const entry of active.entries) for (const field of entry.fields) if (field.kind === 'task') field.state = 'unknown'
      }
      // A finite separator layout provides explicit role/project and context
      // boundaries without judging the words themselves. Optional dates do not
      // affect points, tenure, age, continuity or any other assessment.
      const header = splitEntryHeader(text, active.kind, span)
      if (header) {
        if (++entryCount > RESUME_QUALITY_LIMITS.entries || (fieldCount += 2) > RESUME_QUALITY_LIMITS.fields) return null
        active.pendingContext = undefined; active.unresolvedEntry = undefined
        active.entries.push({ fields: header, anchor: span })
        continue
      }
      if (meaningfulIdentifier(text, active.kind)) {
        if (++entryCount > RESUME_QUALITY_LIMITS.entries || ++fieldCount > RESUME_QUALITY_LIMITS.fields) return null
        const entry: Entry = { fields: [{ kind: 'identifier', span, state: 'present' }], anchor: span }
        active.entries.push(entry); active.pendingContext = entry; active.unresolvedEntry = undefined
        continue
      }
      // Plain description lines from our own builder use the same concrete
      // action/object rule as bullet lines. No synthetic punctuation is inserted.
      const plainClaim = active.uncertainTasks ? null : concreteTaskPrefix(text)
      if (plainClaim) {
        if (++fieldCount > RESUME_QUALITY_LIMITS.fields) return null
        let entry = active.entries.at(-1)
        if (!entry) {
          if (++entryCount > RESUME_QUALITY_LIMITS.entries) return null
          entry = { fields: [], anchor: span }; active.entries.push(entry)
        }
        entry.fields.push({ kind: 'task', span: { ...span, end: span.start + plainClaim.length, excerpt: plainClaim }, state: 'present' })
        active.pendingContext = undefined
        continue
      }
      if (active.pendingContext) {
        // The adjacent, bounded non-sentence line is an explicit conventional
        // header context. Dates are not required, graded or used to infer gaps.
        const contextEntry = active.pendingContext
        active.pendingContext = undefined
        if (meaningfulContext(text) && !/[.!?]/.test(text) && !/^[-*\u2022]|^\d{1,2}[.)]/.test(text) && !isDateLine(text)) {
          if (++fieldCount > RESUME_QUALITY_LIMITS.fields) return null
          contextEntry.fields.push({ kind: 'context', span, state: 'present' })
          continue
        }
      }
      const bullet = /^(?:[-*\u2022] |\d{1,2}[.)] )\S.*$/.exec(text)
      if (bullet) {
        if (++fieldCount > RESUME_QUALITY_LIMITS.fields) return null
        let entry = active.entries.at(-1)
        if (!entry) {
          if (++entryCount > RESUME_QUALITY_LIMITS.entries) return null
          entry = { fields: [], anchor: span }; active.entries.push(entry)
        }
        const prefixLength = text.match(/^(?:[-*\u2022] |\d{1,2}[.)] )/)![0].length
        const claim = active.uncertainTasks ? null : concreteTaskPrefix(text.slice(prefixLength))
        entry.fields.push({ kind: 'task', span: claim
          ? { page: span.page, start: span.start + prefixLength, end: span.start + prefixLength + claim.length, excerpt: claim }
          : span, state: claim ? 'present' : 'unknown' })
        continue
      }
      const match = /^([A-Za-z][A-Za-z ]{0,39}):[ \t]*(.*)$/.exec(text)
      if (!match) { if (!detachUnknown(span)) return null; continue }
      const label = match[1].toLowerCase()
      if (!Object.hasOwn(labels, label)) { if (!detachUnknown(span)) return null; continue }
      const fieldKind = labels[label]
      if (fieldKind === 'identifier' && !identifierLabels[active.kind].includes(label)) { if (!detachUnknown(span)) return null; continue }
      if (fieldKind === 'context' && !contextLabels[active.kind].includes(label)) { if (!detachUnknown(span)) return null; continue }
      if (++fieldCount > RESUME_QUALITY_LIMITS.fields) return null
      let entry = active.entries.at(-1)
      if (!entry || (fieldKind === 'identifier' && (entry === active.unresolvedEntry || entry.fields.some(field => field.kind === 'identifier')))) {
        if (++entryCount > RESUME_QUALITY_LIMITS.entries) return null
        entry = { fields: [], anchor: span }
        active.entries.push(entry)
      }
      if (fieldKind === 'identifier') active.unresolvedEntry = undefined
      const value = match[2].trim()
      let state = stateOf(value, label)
      const claim = fieldKind === 'task' && !active.uncertainTasks ? concreteTaskPrefix(value) : null
      if (state === 'present' && (fieldKind === 'identifier' ? !meaningfulIdentifier(value, active.kind)
        : fieldKind === 'context' ? !meaningfulContext(value) : !claim)) state = 'unknown'
      const fieldSpan = state === 'placeholder' && isSafeExcerpt(text) ? { ...span, excerpt: text }
        : { page: span.page, start: span.start, end: span.start + match[1].length + 1, excerpt: `${match[1]}:` }
      const valueStart = span.start + text.indexOf(':') + 1 + (text.slice(text.indexOf(':') + 1).length - text.slice(text.indexOf(':') + 1).trimStart().length)
      entry.fields.push({ kind: fieldKind, span: state === 'present' && claim
        ? { page: span.page, start: valueStart, end: valueStart + claim.length, excerpt: claim } : fieldSpan, state })
    }
  }
  return sections
}

const privateLabels = /^(?:name|contact|email|phone|address|age|gender|sex|nationality|citizenship|religion|disability|health|marital status|date of birth)$/i
function isDateLine(text: string): boolean {
  return /^(?:(?:[A-Za-z]{3,9} )?\d{4})(?: ?[-–—] ?(?:(?:[A-Za-z]{3,9} )?\d{4}|present|current))?$/i.test(text)
}
function splitEntryHeader(text: string, kind: Exclude<SectionKind, 'skills'>, span: ResumeQualitySpan): Field[] | null {
  // Do not parse general prose, slash-delimited contact lines, years alone or
  // unlabelled facts. Pipes and a comma after a recognized title are supported.
  let separator = ' | '
  let parts = text.split(separator)
  if (parts.length === 1 && text.includes(', ')) {
    const comma = text.indexOf(', ')
    if (!meaningfulIdentifier(text.slice(0, comma), kind)) return null
    separator = ', '; parts = [text.slice(0, comma), text.slice(comma + separator.length)]
  }
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !part.trim() || part.length > 160) ||
      parts.slice(0, 2).some(part => privateLabels.test(part.trim()) || /[:@<>\r\n]/.test(part) || /^https?:/i.test(part)) ||
      !/[A-Za-z\u00c0-\uffff]/.test(parts[0]) || !/[A-Za-z\u00c0-\uffff]/.test(parts[1])) return null
  if (parts.length === 3 && !/^(?:(?:[A-Za-z]{3,9} )?\d{4})(?: ?[-–—] ?(?:(?:[A-Za-z]{3,9} )?\d{4}|present|current))?$/i.test(parts[2].trim())) return null
  // A role/project/credential and its organization/issuer may use this same
  // structural layout. No vocabulary whitelist or organization prestige score.
  const identityKnown = meaningfulIdentifier(parts[0].trim(), kind)
  const contextKnown = meaningfulContext(parts[1].trim())
  return parts.slice(0, 2).map((part, index) => {
    const leading = part.length - part.trimStart().length
    const start = span.start + (index === 0 ? 0 : parts[0].length + separator.length) + leading
    return { kind: index === 0 ? 'identifier' as const : 'context' as const,
      span: { page: span.page, start, end: start + part.trim().length },
      state: (index === 0 ? identityKnown : contextKnown) ? 'present' as const : 'unknown' as const }
  })
}

const finding = (code: ResumeQualityFeedbackCode, evidence: ResumeQualitySpan[] = []): ResumeQualityFinding => ({
  code, status: codeStatus(code), evidence: [...new Map(evidence.map(span => [spanKey(span), span])).values()].slice(0, 3),
})
function fieldFinding(entry: Entry, kind: FieldKind): ResumeQualityFinding {
  const fields = entry.fields.filter(field => field.kind === kind)
  const prefix = kind === 'identifier' ? 'entry' : kind === 'task' ? 'task' : 'context'
  const placeholder = fields.find(field => field.state === 'placeholder')
  if (placeholder) return finding(`${prefix}_placeholder`, [placeholder.span])
  const observed = fields.find(field => field.state === 'present')
  if (observed) return finding(kind === 'task' ? 'task_presented' : kind === 'identifier' ? 'entry_identified' : 'context_identified', [observed.span])
  return finding(`${prefix}_unknown`, fields.length ? [fields[0].span] : [])
}

/** No network, model, job rubric, clock, file, logging or external verification. */
export function assessResumeDocumentQuality(input: unknown, expectedSourceSha256: string): ResumeDocumentQualityResult {
  const parsed = boundedPages(input, expectedSourceSha256)
  if (!parsed) return { status: 'unavailable' }
  // Prompt-like control text is never executed or treated as professional proof.
  // A conservative unavailable result is not a negative document score.
  if (parsed.localPages.some(page => /(?:ignore|disregard|override) (?:all |the |any |previous |prior |system )*(?:instructions|rules|prompt)|(?:give|assign|award) (?:me |this |the resume )?(?:a )?(?:score|rank)|<\/?(?:script|system|assistant|developer)>|\[INST\]/i.test(page))) return { status: 'unavailable' }
  const sections = observePages(parsed.localPages)
  if (!sections) return { status: 'unavailable' }
  const observations: Record<ResumeQualityDimensionId, ResumeQualityFinding[]> = {
    organization: sections.length ? [finding('section_identified', sections.slice(0, 3).map(section => section.heading))] : [finding('organization_unknown')],
    entry_completeness: [], task_evidence: [], traceability: [],
  }
  for (const section of sections) {
    if (section.kind === 'skills') continue
    // A heading with unsupported prose is one unresolved observation, not a
    // missing-entry failure; a short/new-career resume needs no work section.
    const entries = section.entries.length ? section.entries : [{ fields: [], anchor: section.heading }]
    for (const entry of entries) {
      const identifier = fieldFinding(entry, 'identifier')
      const context = fieldFinding(entry, 'context')
      const task = fieldFinding(entry, 'task')
      observations.entry_completeness.push(identifier.status === 'needs_attention' ? identifier
        : identifier.status === 'supported' && context.status === 'supported'
          ? finding('entry_identified', [...identifier.evidence, ...context.evidence])
          : finding('entry_unknown'))
      observations.task_evidence.push(task)
      observations.traceability.push(identifier.status === 'supported' && task.status === 'supported'
        ? context.status === 'supported' ? finding('context_identified', [...identifier.evidence, ...context.evidence, ...task.evidence])
          : context.status === 'needs_attention' ? context : finding('context_unknown')
        : finding('context_unknown'))
    }
  }
  if (!observations.entry_completeness.length) observations.entry_completeness.push(finding('entry_unknown'))
  if (!observations.task_evidence.length) observations.task_evidence.push(finding('task_unknown'))
  if (!observations.traceability.length) observations.traceability.push(finding('context_unknown'))
  if (Object.values(observations).some(items => items.length > RESUME_QUALITY_LIMITS.findingsPerDimension)) return { status: 'unavailable' }
  const dimensions = definitions.map(definition => ({ ...definition, maxPoints: 25 as const, ...tally(observations[definition.id]), findings: observations[definition.id] }))
  const sum = (key: 'supportedPoints' | 'observablePoints' | 'unknownPoints') => round(dimensions.reduce((n, d) => n + d[key], 0))
  const report = {
    status: 'assessed' as const, kind: 'resume_document_quality' as const, rubricVersion: RESUME_QUALITY_RUBRIC_VERSION,
    sourceSha256: parsed.sourceSha256, supportedPoints: sum('supportedPoints'), observablePoints: sum('observablePoints'),
    unknownPoints: sum('unknownPoints'), evidenceCoverage: sum('observablePoints'), dimensions,
  }
  return validateResumeDocumentQuality(report, expectedSourceSha256)
}
