/**
 * LOCAL, DEFAULT-OFF proposal for broader résumé document critique input.
 *
 * Admission is structural, not a closed job/skill vocabulary: a recognized
 * professional section is inspected as ONE scope, including every paragraph,
 * bullet, qualification and wrap. Unsafe scopes are omitted in full. There is
 * no sentence rescue, regex replacement, full-page fallback or claim inference.
 *
 * These conservative lexical checks REDUCE privacy/instruction risk. They are
 * not a general PII anonymizer, language interpreter or proof that arbitrary
 * prose contains no identity. Do not enable provider transmission on the strength
 * of this module alone. Keep the feature default-OFF pending privacy review.
 */

export const PROFESSIONAL_PROJECTION_LIMITS = Object.freeze({
  pages: 20, pageCharacters: 30_000, inputCharacters: 120_000,
  sectionCharacters: 8_000, providerCharacters: 16_000, records: 40,
})
export const PROFESSIONAL_SECTIONS = ['summary', 'work', 'skills', 'qualifications', 'achievements'] as const
export type ProfessionalSection = typeof PROFESSIONAL_SECTIONS[number]
export type ProfessionalSourceRecord = Readonly<{
  id: string
  section: ProfessionalSection
  /** Unchanged UTF-16 slice of ONE locally parsed page, including its wraps. */
  text: string
  order: number
}>
/** The only object in this module intended for a model request. No raw source,
 * source hash, page/offset, name, omission reason or arbitrary metadata key. */
export type ProfessionalProjectionData = Readonly<{
  records: readonly ProfessionalSourceRecord[]
  coverage: 'full' | 'partial' | 'none'
  omissions: Readonly<{ professionalContent: boolean; unclassifiedContent: boolean; limitReached: boolean }>
  overallQualityScoreAllowed: boolean
}>
export type ProfessionalSourceSpan = Readonly<{ page: number; start: number; end: number }>
export type ProfessionalOmissionReason = 'intentional_identity_exclusion' | 'intentional_nonprofessional_exclusion' |
  'unclassified_scope' | 'unsafe_professional_scope' | 'unresolved_context' | 'limit' | 'empty_professional_scope'
export type ProfessionalProjection = Readonly<{
  sourceSha256: string
  providerInput: ProfessionalProjectionData
  localSources: readonly Readonly<{ id: string; spans: readonly ProfessionalSourceSpan[] }>[]
  /** Fixed codes and spans ONLY, never copies of omitted private text. */
  localOmissions: readonly Readonly<{ reason: ProfessionalOmissionReason; spans: readonly ProfessionalSourceSpan[] }>[]
}>

type Section = ProfessionalSection | 'excluded' | 'unknown'
type Line = { page: number; start: number; end: number; text: string }
type Scope = { section: Section; lines: Line[] }

const professionalHeadings: Readonly<Record<string, ProfessionalSection>> = Object.freeze({
  summary: 'summary', 'professional summary': 'summary', 'career summary': 'summary',
  profile: 'summary', 'professional profile': 'summary', 'personal profile': 'summary', 'personal statement': 'summary',
  objective: 'summary', 'career objective': 'summary', 'professional objective': 'summary',
  work: 'work', employment: 'work', experience: 'work', 'work experience': 'work', 'professional experience': 'work',
  'work experiences': 'work', 'professional experiences': 'work', 'employment experiences': 'work',
  'relevant experiences': 'work', 'volunteer experiences': 'work', 'internship experiences': 'work',
  'employment experience': 'work', 'employment history': 'work', 'work history': 'work',
  'relevant experience': 'work', 'career history': 'work', 'work and experience': 'work',
  'volunteer experience': 'work', 'volunteering experience': 'work', 'volunteer work': 'work',
  'internship experience': 'work', internships: 'work', projects: 'work', 'professional projects': 'work',
  skills: 'skills', 'technical skills': 'skills', 'key skills': 'skills', 'core skills': 'skills',
  'professional skills': 'skills', 'relevant skills': 'skills', 'skills and abilities': 'skills',
  'skills and competencies': 'skills', 'core competencies': 'skills', competencies: 'skills',
  languages: 'skills', 'language skills': 'skills',
  'tools and technologies': 'skills', 'technical expertise': 'skills', 'areas of expertise': 'skills',
  qualifications: 'qualifications', education: 'qualifications', 'education and training': 'qualifications',
  'educational background': 'qualifications', 'education background': 'qualifications', 'academic background': 'qualifications',
  'educational qualifications': 'qualifications', 'academic qualifications': 'qualifications',
  'education and qualifications': 'qualifications', 'education and certifications': 'qualifications',
  training: 'qualifications', certifications: 'qualifications', certificates: 'qualifications',
  'professional certifications': 'qualifications', 'professional qualifications': 'qualifications',
  'licenses and certifications': 'qualifications', 'licences and certifications': 'qualifications',
  'professional development': 'qualifications', 'courses and training': 'qualifications',
  achievements: 'achievements', 'key achievements': 'achievements', accomplishments: 'achievements',
  'professional achievements': 'achievements', 'awards and achievements': 'achievements',
  'selected achievements': 'achievements', 'career highlights': 'achievements', awards: 'achievements',
})
const referenceHeadings = new Set(['references', 'referees', 'professional references', 'professional referees', 'character references'])
const excludedHeadings = new Set([
  'personal', 'personal details', 'personal information', 'contact', 'contact details', 'contact information',
  ...referenceHeadings, 'personal interests', 'interests', 'hobbies',
  'additional personal information', 'family', 'demographics', 'equal opportunities',
  'hobbies and interests', 'interests and activities', 'personal background', 'medical information', 'health information',
])
const titleHeadings = new Set(['resume', 'résumé', 'curriculum vitae', 'cv'])
const headingKey = (text: string) => text.trim().replace(/:$/, '').replace(/\s*&\s*/g, ' and ').replace(/\s+/gu, ' ').trim().toLowerCase()
function heading(text: string): Section | 'title' | undefined {
  const key = headingKey(text)
  if (Object.hasOwn(professionalHeadings, key)) return professionalHeadings[key]
  if (excludedHeadings.has(key)) return 'excluded'
  if (titleHeadings.has(key)) return 'title'
  // Plain text has no reliable heading geometry. Uppercase employer/role lines
  // remain content, not guessed boundaries. Clear personal labels terminate;
  // other short colon headings are unknown and stop professional admission.
  const value = text.trim()
  if (value.length > 0 && value.length <= 70 &&
      /^[\p{L}][\p{L} &/()-]{1,59}:$/u.test(value)) return 'unknown'
  return undefined
}

const contactRisk = /(?:[\p{L}\p{N}._%+-]+\s*@\s*[\p{L}\p{N}.-]+|\b(?:https?:\/\/|www\.|linkedin\s*[./]|github\s*[./])|\b[\w.+-]+\s*(?:\[at\]|\(at\))\s*[\w.-]+\s*(?:\[dot\]|\(dot\)|\.)|\b(?:email|e-mail|phone(?: number)?|telephone|tel|cell|fax|mobile|cellphone|whatsapp|contact number|home address|postal address|residential address|postcode|zip code)\s*[:=]|\bP\.?\s*O\.?\s*Box\b|\b\d{1,6}\s+[\p{L}]+(?:\s+[\p{L}]+){0,3}\s+(?:Street|Road|Avenue|Lane|Drive|Boulevard|Close|Crescent)\b)/iu
const phoneRisk = /(?:^|[^\d])(?:\+\d{1,3}[\s().-]*)?(?:\(\d{2,4}\)[\s.-]*\d{3,4}[\s.-]*\d{3,4}|\d{3}[ .-]\d{3}[ .-]\d{4}|\d{4}[ .-]\d{3}[ .-]\d{3}|\d{9,15})(?:$|[^\d])/u
const identityLabels = /\b(?:name|full name|first name|last name|surname|maiden name|date of birth|birth ?date|dob|nationality|citizenship|marital status|religion|ethnicity|ethnic origin|race|gender|sex|pronouns|disability|medical condition|passport|national id|social security|ssn|taxpayer id|driver'?s? licen[cs]e|bank account|iban|credit card)\s*[:=]/iu
const identityRisk = /(?:\b(?:full name|first name|last name|surname|maiden name|date of birth|birth ?date|dob|nationality|citizenship|marital status|religion|ethnicity|ethnic origin|race|gender|sex|pronouns|disability|medical condition|passport|national id|social security|ssn|taxpayer id|driver'?s? licen[cs]e|bank account|iban|credit card)\s*[:=]|\b[Mm]y name (?:is|:)\b|\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+|\b(?:colleague|supervisor|manager|referee|reference|client|coworker|co-worker)\s+(?:named\s+)?\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+|\b(?:I am|I'm|I’m)\s+\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+|\b\d{3}-\d{2}-\d{4}\b)/u
const protectedRisk = /(?:\b(?:born|birthplace)\s*(?:on|in|:)\s*\S|\b(?:age|aged)\s*[:=]?\s*\d{1,3}\b|\b\d{1,3}[ -]years?[ -]old\b|\b(?:I am|I'm|I’m)\s+\d{1,3}\b|\b(?:I am|I'm|I’m|I identify as|I consider myself)\s+(?:a\s+|an\s+)?(?:male|female|man|woman|nonbinary|non-binary|transgender|gay|lesbian|bisexual|Black|White|Asian|Christian|Muslim|Jewish|Hindu|Buddhist|disabled|pregnant|diabetic|epileptic|autistic|neurodivergent|dyslexic|deaf|blind|bipolar|HIV positive|HIV-positive|married|single|divorced|widowed|citizen|national)\b|\b(?:married|divorced|widowed)\b|\b(?:my|our)\s+(?:wife|husband|spouse|children|child|baby|son|daughter|religion|faith|nationality|ethnicity|disability|diagnosis|medication)\b|\b(?:I have|I suffer from|I live with|I was diagnosed with|I take|I use)\s+(?:a\s+|an\s+)?(?:disability|diabetes|epilepsy|bipolar disorder|PTSD|OCD|schizophrenia|dyslexia|arthritis|heart disease|chronic illness|hearing loss|visual impairment|cancer|HIV|AIDS|depression|anxiety|autism|ADHD|asthma|insulin|antidepressants|wheelchair)\b|\b(?:I|I've|I have)\s+(?:was\s+|been\s+|am\s+)?(?:diagnosed|hospitalized|hospitalised|medicated|treated)\b|\b(?:no|without)\s+(?:children|dependants|dependents|disabilities|medical conditions)\b|\b(?:citizen|national)\s+of\b|\b(?:I am|I'm|I’m)\s+(?:a\s+|an\s+)?[\p{L}-]+\s+(?:citizen|national)\b|\b(?:he\/him|she\/her|they\/them)\b)/iu
const instructionRisk = /(?:<\/?(?:system|assistant|developer|instructions?|prompt)\b|\b(?:ignore|disregard|override|bypass)\b[\s\S]{0,90}\b(?:instructions?|rules?|policy|policies|prompt|previous|above|below|system|review)\b|\b(?:system|developer|assistant)\s*(?:message|prompt|instructions?|:)|\b(?:reviewer|evaluator|screening model|language model|chatgpt|AI assistant)\s*[:;,]|\b(?:return|output|respond|assign|give|set|mark|rate|score|rank)\b[\s\S]{0,80}\b(?:this candidate|this applicant|this resume|this résumé|me as|my resume|my résumé|perfect|maximum score|highest score|10\s*\/\s*10|positive recommendation|hire me|JSON)\b|\b(?:do not|don't|never)\s+(?:disclose|mention|report|reveal|penalize|penalise)\b|\b(?:follow these instructions|prompt injection|ignore all|recommend hiring me)\b)/iu
function hasIdentityRisk(text: string): boolean {
  // A professional organization/product label is not an applicant-name field.
  // This changes only the detection view, never transmitted text or source spans.
  const labels = text.replace(/\b(company|employer|organisation|organization|business|product|project|system|tool|course|institution)\s+(?:full\s+)?name\s*:/giu, '$1:')
  return identityLabels.test(labels) || identityRisk.test(labels)
}
const detectionText = (text: string) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim()
const unsafeCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u
// Scope-bearing content outside an admitted professional section cannot simply
// vanish. Do not let headings/bullets promote later statements to personal facts.
const excludedScopeRisk = /(?:\b(?:not|never|no|without|cannot|can't|didn't|haven't|hasn't|isn't|aren't|would|could|wish|hope|aspire|hypothetical|fictional|example|sample|template|training|practice|practise|coursework|simulation|requirements?|pending|expired|revoked|cancelled|canceled|unverified)\b|\b(?:my colleague|my supervisor|someone else|another person|not mine|not my|their experience|their work|they performed|they did|only observed)\b)/iu

function isIdentityMetadata(text: string): boolean {
  const value = detectionText(text)
  if (!value) return false
  if (titleHeadings.has(headingKey(value)) || isAtomicContactMetadata(value) || isAtomicPersonalMetadata(value)) return true
  // Intentional exclusions are WHOLE metadata forms, not lines that merely
  // contain private text. Mixed professional/private preamble is incomplete.
  if (/^(?:name|full name|first name|last name|surname)\s*:\s*[^.;:!?]{1,80}$/iu.test(value) &&
      value.split(':')[1].trim().split(/\s+/u).length <= 5) return true
  if (/^(?:dob|date of birth|birth date)\s*:\s*(?:[0-9 /.-]{4,20}|[0-9]{1,2} [\p{L}]{3,12} [0-9]{4})$/iu.test(value)) return true
  if (/^(?:nationality|citizenship|marital status|religion|ethnicity|race|gender|sex|pronouns)\s*:\s*[\p{L} /'-]{1,40}$/iu.test(value)) return true
  if (/^\d{1,6} [\p{L}]+(?: [\p{L}]+){0,3} (?:Street|Road|Avenue|Lane|Drive|Boulevard|Close|Crescent)$/iu.test(value)) return true
  // Perimeter name heuristic, not a general professional vocabulary gate.
  return /^(?:\p{Lu}[\p{L}'’-]*|\p{Lu}\.)[ \t]+(?:\p{Lu}[\p{L}'’-]*|\p{Lu}\.)(?:[ \t]+\p{Lu}[\p{L}'’-]*){0,2}$/u.test(value)
}

// This recognizes an intentionally omitted perimeter header, not professional
// evidence. A contact value alone does not make adjoining prose harmless.
// Country names come from the runtime's English region data; Canadian province
// names also cover the common city/province format without a written country.
const locationAnchors = new Set([
  'alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland and labrador',
  'northwest territories', 'nova scotia', 'nunavut', 'ontario', 'prince edward island',
  'quebec', 'saskatchewan', 'yukon', 'antigua', 'barbuda',
])
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
for (let first = 65; first <= 90; first++) for (let second = 65; second <= 90; second++) {
  const code = String.fromCharCode(first, second), name = regionNames.of(code)
  if (name && name !== code && code !== 'ZZ') locationAnchors.add(name.toLowerCase().replace(/&/g, 'and'))
}
const placeKey = (value: string) => value.toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ')
// Positive locality anchors, not a guess that every capitalized noun is a city.
// This deliberately supports fewer headers than a geocoder. Unknown localities
// retain the existing incomplete-coverage behavior rather than hiding claims.
const cityAnchors = new Set(Intl.supportedValuesOf('timeZone')
  .filter(zone => zone.includes('/') && !zone.startsWith('Etc/'))
  .map(zone => placeKey(zone.split('/').at(-1)!.replace(/_/g, ' '))))
const headerProfessionalRisk = /\b(?:work(?:ed|ing)?|employment|experience|skills?|qualifications?|certif\w*|diploma|degree|education|training|duties|responsibilities|role|projects?|achievements?|sales|retail|payroll|payments?|accounts?|invoices?|engineering|software|microsoft|excel|powerpoint|quickbooks|managed|handled|processed|maintained|coordinated|assisted|supported|developed|implemented|created|designed|delivered|built|led|sold|trained|increased|reduced|generated|improved|supervised|reconciled|organized|organised|wrote|performed|completed|qualified|proficient|expert|years?|applicant|candidate|score|rating|review|assistant|associate|manager|director|engineer|developer|designer|consultant|specialist|coordinator|administrator|officer|technician|analyst|supervisor|clerk|operator|accountant|nurse|teacher|chef|driver|worker|ltd|limited|inc|llc|company|corporation)\b/iu
function isCombinedLocationContactMetadata(text: string): boolean {
  if (text.length > 180) return false
  const fields = text.split(/\s*[|•]\s*/u)
  const directContact = (field: string) => isAtomicContactMetadata(field) && !/(?:https?:\/\/|www\.)/i.test(field)
  if (fields.length < 2 || fields.length > 3 || !fields.some(directContact)) return false
  const places = fields.filter(field => !directContact(field))
  if (places.length !== 1 || excludedScopeRisk.test(places[0]) || instructionRisk.test(places[0]) ||
      headerProfessionalRisk.test(places[0])) return false
  const parts = places[0].replace(/&/g, 'and').split(/\s*,\s*/u)
  if (parts.length < 2 || parts.length > 3 || !locationAnchors.has(parts.at(-1)!.toLowerCase())) return false
  if (!cityAnchors.has(placeKey(parts.at(-2)!))) return false
  if (parts.length === 3 && !cityAnchors.has(placeKey(parts[0])) &&
      !/^(?:North|South|East|West|Central) \p{Lu}[\p{L}'’.-]*(?: \p{Lu}[\p{L}'’.-]*){0,2}$/u.test(parts[0])) return false
  // No sentences, arbitrary labels, numbers, lists of skills, or single token
  // beside an email. This is a bounded place-header heuristic, not geocoding.
  return parts.every(part => part.length <= 60 &&
    /^\p{Lu}[\p{L}'’.-]*(?: (?:\p{Lu}[\p{L}'’.-]*|and|of|the)){0,5}$/u.test(part))
}

function isLabelledPhonePair(text: string): boolean {
  // Consume the WHOLE labelled line: two bounded phone values, no prose tail.
  if (text.length > 80) return false
  const pair = text.match(/^(?:phone|telephone|mobile|tel|cell)\s*:\s*(.+?)\s+or\s+(.+)$/iu)
  return !!pair && pair.slice(1).every(number => /^\+?[0-9 ()-]{7,25}$/u.test(number) &&
    /^\d{7,15}$/u.test(number.replace(/\D/gu, '')))
}
function isAtomicContactMetadata(text: string): boolean {
  const value = detectionText(text)
  const fields = value.split(/\s*[|•]\s*/u)
  if (fields.length > 1) return fields.every(field => isAtomicContactMetadata(field))
  // Skip only entire contact values for scope detection, not arbitrary lines
  // that happen to contain an email. An email domain such as example.invalid
  // is not an 'example work' disclaimer. Mixed clauses still taint context.
  return /^(?:(?:e-?mail|contact)\s*:\s*)?[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+$/iu.test(value) ||
    /^(?:(?:phone|telephone|mobile|tel|cell)\s*:\s*)?\+?[0-9 ()-]{7,25}$/iu.test(value) ||
    isLabelledPhonePair(value) ||
    /^(?:(?:website|portfolio|linkedin)\s*:\s*)?(?:https?:\/\/|www\.)[^\s]+$/iu.test(value)
}
function isAtomicPersonalMetadata(text: string): boolean {
  const value = detectionText(text)
  return /^(?:no|without) (?:children|dependants|dependents|disabilities|medical conditions)[.]?$/iu.test(value) ||
    /^(?:not married|never married|not pregnant|no religion)[.]?$/iu.test(value)
}
function isAtomicReferenceTitle(text: string): boolean {
  // Whole organizational titles only, after an explicit reference heading.
  // Never erase a narrative qualifier or exempt training elsewhere. The original
  // scope still undergoes instruction/control detection before this exemption.
  const value = detectionText(text).replace(/\s*&\s*/gu, ' and ')
  const role = '(?:manager|director|officer|coordinator|specialist|supervisor|head)'
  const department = '(?:training(?: and development)?|learning and development)'
  return new RegExp(`^(?:(?:senior|assistant|deputy) )?(?:${role}(?: ?[-–—,:] ?| of | for | )${department}|${department} ${role})$`, 'iu').test(value)
}
function excludedQualifierText(lines: readonly Line[], allowReferenceTitles: boolean): string {
  // Preserve the complete scope for qualification checks before exempting any
  // title. An ownership/claim narrative can refer to a title on another line.
  const substantive = lines.filter(line => !isAtomicContactMetadata(line.text) && !isAtomicPersonalMetadata(line.text))
  const original = detectionText(substantive.map(line => line.text).join('\n'))
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+/gu, ' ') // A domain is not a scope qualifier.
  const linkedNarrative = /\b(?:I|me|my|mine|we|our|ours|he|him|his|she|her|hers|they|them|their|theirs|everything|these|those|above|below|following|preceding|earlier|work|duties|tasks?|experience|skills?|qualifications?|achievements?|claims?|certifications?|licen[cs]es?|belongs?|performed|by)\b/iu
  if (!allowReferenceTitles || linkedNarrative.test(original)) return original
  let inReferences = false
  return detectionText(substantive.filter(line => {
    // The parser deliberately keeps excluded headings in one scope, including
    // across pages. Track their sub-boundaries without resetting risk scans.
    const key = headingKey(line.text)
    if (excludedHeadings.has(key)) inReferences = referenceHeadings.has(key)
    return !(inReferences && isAtomicReferenceTitle(line.text))
  }).map(line => line.text).join('\n'))
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+/gu, ' ')
}
function hasAdequateProfessionalText(records: readonly ProfessionalSourceRecord[]): boolean {
  if (!records.some(record => record.section !== 'summary')) return false
  return (records.length >= 2 && records.reduce((sum, record) => sum + record.text.length, 0) >= 160) ||
    (records.length === 1 && records[0].section !== 'summary' && records[0].text.length >= 300)
}

function linesOf(pages: readonly string[]): Line[] {
  const lines: Line[] = []
  pages.forEach((page, pageIndex) => {
    let start = 0
    while (start < page.length) {
      const match = /\r\n|\r|\n/g
      match.lastIndex = start
      const newline = match.exec(page)
      const end = newline ? newline.index : page.length
      lines.push({ page: pageIndex + 1, start, end, text: page.slice(start, end) })
      start = newline ? end + newline[0].length : page.length
    }
  })
  return lines
}
function spansOf(lines: readonly Line[], pages: readonly string[]): ProfessionalSourceSpan[] {
  const spans: ProfessionalSourceSpan[] = []
  for (const line of lines) {
    const previous = spans.at(-1)
    if (previous?.page === line.page) {
      spans[spans.length - 1] = { ...previous, end: line.end }
    } else spans.push({ page: line.page, start: line.start, end: line.end })
  }
  // Trim outer whitespace by changing offsets, NEVER changing source content.
  return spans.map(span => {
    const raw = pages[span.page - 1].slice(span.start, span.end)
    const leading = raw.match(/^\s*/u)![0].length
    const trailing = raw.match(/\s*$/u)![0].length
    return { ...span, start: span.start + leading, end: Math.max(span.start + leading, span.end - trailing) }
  }).filter(span => span.end > span.start)
}
function hasKnownIdentity(text: string, identities: ReadonlySet<string>): boolean {
  const value = text.toLocaleLowerCase('en-US')
  return [...identities].some(identity => {
    const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(value)
  })
}

/** Pure local function. The hash is provenance supplied by the SAME bounded PDF
 * parse, not an assertion that this function has rehashed PDF bytes. Returns null
 * on malformed/oversized parse input. Does not read flags, files or the network. */
export function projectProfessionalResume(input: Readonly<{ sourceSha256: string; pages: readonly string[] }>): ProfessionalProjection | null {
  if (!input || typeof input.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sourceSha256) ||
      !Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > PROFESSIONAL_PROJECTION_LIMITS.pages ||
      input.pages.some(page => typeof page !== 'string' || page.length > PROFESSIONAL_PROJECTION_LIMITS.pageCharacters) ||
      input.pages.reduce((sum, page) => sum + page.length, 0) > PROFESSIONAL_PROJECTION_LIMITS.inputCharacters) return null
  const pages = input.pages
  const scopes: Scope[] = []
  let current: Scope = { section: 'unknown', lines: [] }
  const identities = new Set<string>()
  const flush = () => { if (current.lines.length || PROFESSIONAL_SECTIONS.includes(current.section as ProfessionalSection)) scopes.push(current) }
  for (const line of linesOf(pages)) {
    const boundary = heading(line.text)
    if (boundary !== undefined) {
      // Even repeated same-section headings remain in a single scope, so page
      // continuation cannot reset a negation or salvage a rejected section.
      if (boundary === current.section && current.section !== 'unknown') {
        current.lines.push(line)
        continue
      }
      flush()
      current = { section: boundary === 'title' ? 'unknown' : boundary, lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  flush()

  // Prefer labelled applicant names. At most ONE leading unlabelled name is
  // inferred before any professional section; repeated title/company metadata
  // must not become an identity denylist. This is still a heuristic, not NER.
  let consideredLeadingName = false
  let sawProfessionalScope = false
  const roleOrCompanyMetadata = /\b(?:assistant|associate|manager|director|engineer|developer|designer|consultant|specialist|coordinator|administrator|officer|technician|analyst|supervisor|clerk|operator|accountant|nurse|teacher|chef|driver|worker|lead|ltd|limited|inc|llc|plc|company|corporation)\b/iu
  for (const scope of scopes) {
    if (scope.section !== 'unknown' && scope.section !== 'excluded') { sawProfessionalScope = true; continue }
    for (const line of scope.lines) {
      const value = detectionText(line.text)
      const labelledName = value.match(/^(?:name|full name|first name|last name|surname)\s*:\s*([^.;:!?]{1,80})$/iu)?.[1]
      if (labelledName && labelledName.trim().split(/\s+/u).length <= 5) {
        identities.add(labelledName.trim().toLocaleLowerCase('en-US'))
        consideredLeadingName = true
      } else if (!sawProfessionalScope && !consideredLeadingName && scope.section === 'unknown' && !titleHeadings.has(headingKey(value)) &&
          /^(?:\p{Lu}[\p{L}'’-]*|\p{Lu}\.)[ \t]+(?:\p{Lu}[\p{L}'’-]*|\p{Lu}\.)(?:[ \t]+\p{Lu}[\p{L}'’-]*){0,2}$/u.test(value) &&
          !roleOrCompanyMetadata.test(value)) {
        identities.add(value.toLocaleLowerCase('en-US'))
        consideredLeadingName = true
      }
    }
  }

  const omissions = { professionalContent: false, unclassifiedContent: false, limitReached: false }
  const localOmissions: { reason: ProfessionalOmissionReason; spans: ProfessionalSourceSpan[] }[] = []
  const candidates: { section: ProfessionalSection; spans: ProfessionalSourceSpan[]; length: number }[] = []
  let unresolvedContext = false
  let admittedCharacters = 0
  let admittedRecords = 0
  let professionalScopeSeen = false
  for (const scope of scopes) {
    if (PROFESSIONAL_SECTIONS.includes(scope.section as ProfessionalSection)) professionalScopeSeen = true
    const spans = spansOf(scope.lines, pages)
    if (!spans.length) {
      if (PROFESSIONAL_SECTIONS.includes(scope.section as ProfessionalSection)) {
        omissions.professionalContent = true
        localOmissions.push({ reason: 'empty_professional_scope', spans: [] })
      }
      continue
    }
    // Joining is ONLY for conservative risk detection; never emitted or cited.
    const raw = spans.map(span => pages[span.page - 1].slice(span.start, span.end)).join('\n')
    const text = detectionText(raw)
    const instruction = instructionRisk.test(text) || unsafeCharacters.test(raw)
    if (scope.section !== 'unknown' && scope.section !== 'excluded' &&
        scope.lines.every(line => !line.text.trim() || heading(line.text) === scope.section)) {
      omissions.professionalContent = true
      localOmissions.push({ reason: 'empty_professional_scope', spans })
      continue
    }
    if (instruction) unresolvedContext = true
    if (scope.section === 'unknown' || scope.section === 'excluded') {
      const substantiveLines = scope.lines.filter(line => line.text.trim())
      // A labelled identity line containing professional claims or a qualifier
      // is not safe to erase. Scope-bearing excluded text invalidates claims.
      const scopeText = excludedQualifierText(substantiveLines, scope.section === 'excluded')
      if (excludedScopeRisk.test(scopeText)) unresolvedContext = true
      const intentional = scope.section === 'excluded' || substantiveLines.every(line => isIdentityMetadata(line.text) ||
        (!professionalScopeSeen && isCombinedLocationContactMetadata(detectionText(line.text))))
      if (!intentional) omissions.unclassifiedContent = true
      localOmissions.push({ reason: intentional
        ? (scope.section === 'excluded' ? 'intentional_nonprofessional_exclusion' : 'intentional_identity_exclusion')
        : 'unclassified_scope', spans })
      continue
    }
    if (instruction || contactRisk.test(text) || phoneRisk.test(text) || hasIdentityRisk(text) || protectedRisk.test(text) ||
        hasKnownIdentity(text, identities)) {
      omissions.professionalContent = true
      if (excludedScopeRisk.test(text)) unresolvedContext = true
      localOmissions.push({ reason: 'unsafe_professional_scope', spans })
      continue
    }
    const length = spans.reduce((sum, span) => sum + span.end - span.start, 0)
    if (length > PROFESSIONAL_PROJECTION_LIMITS.sectionCharacters ||
        admittedCharacters + length > PROFESSIONAL_PROJECTION_LIMITS.providerCharacters ||
        admittedRecords + spans.length > PROFESSIONAL_PROJECTION_LIMITS.records) {
      omissions.professionalContent = true
      omissions.limitReached = true
      if (excludedScopeRisk.test(text)) unresolvedContext = true
      localOmissions.push({ reason: 'limit', spans })
      continue
    }
    candidates.push({ section: scope.section, spans, length })
    admittedCharacters += length
    admittedRecords += spans.length
  }
  // Excluded instructions or unresolved global attribution may qualify ANY later
  // or earlier claim. No fragment rescue from a tainted document.
  if (unresolvedContext) {
    omissions.professionalContent = true
    for (const candidate of candidates) localOmissions.push({ reason: 'unresolved_context', spans: candidate.spans })
    candidates.length = 0
  }
  const records: ProfessionalSourceRecord[] = []
  const localSources: { id: string; spans: ProfessionalSourceSpan[] }[] = []
  for (const candidate of candidates) for (const span of candidate.spans) {
    const id = `r${records.length + 1}`
    records.push({ id, section: candidate.section, text: pages[span.page - 1].slice(span.start, span.end), order: records.length })
    localSources.push({ id, spans: [span] })
  }
  const coverage = records.length === 0 ? 'none' : !Object.values(omissions).some(Boolean) ? 'full' : 'partial'
  const overallQualityScoreAllowed = coverage === 'full' && hasAdequateProfessionalText(records)
  const result: ProfessionalProjection = {
    sourceSha256: input.sourceSha256,
    providerInput: { records, coverage, omissions, overallQualityScoreAllowed },
    localSources,
    localOmissions,
  }
  return deepFreeze(result)
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => deepFreeze(child))
    Object.freeze(value)
  }
  return value
}
/** Explicit allowlisted serialization boundary. Never serialize the local result
 * itself or spread it into a model request. Caller must not mutate the DTO. */
export function getProfessionalResumeContext(projection: ProfessionalProjection): ProfessionalProjectionData {
  const source = projection.providerInput
  return deepFreeze({
    records: source.records.map(record => ({ id: record.id, section: record.section, text: record.text, order: record.order })),
    coverage: source.coverage,
    omissions: { professionalContent: source.omissions.professionalContent,
      unclassifiedContent: source.omissions.unclassifiedContent, limitReached: source.omissions.limitReached },
    overallQualityScoreAllowed: source.overallQualityScoreAllowed,
  })
}

/** Defense-in-depth validation for the paid boundary, NOT proof of origin or
 * anonymity. Only a projection made from the server's own local parse is an
 * authorized input. Never use this to bless client-supplied professional prose.
 * Text is rechecked jointly so page/record boundaries cannot hide an instruction
 * or split a private phrase. Exact raw text remains untouched. */
export function validateProfessionalProjectionData(input: unknown): ProfessionalProjectionData | null {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
  if (!object(input) || !exactKeys(input, ['records', 'coverage', 'omissions', 'overallQualityScoreAllowed']) ||
      !Array.isArray(input.records) || input.records.length > PROFESSIONAL_PROJECTION_LIMITS.records ||
      !['full', 'partial', 'none'].includes(input.coverage as string) || typeof input.overallQualityScoreAllowed !== 'boolean' ||
      !object(input.omissions) || !exactKeys(input.omissions, ['professionalContent', 'unclassifiedContent', 'limitReached']) ||
      Object.values(input.omissions).some(value => typeof value !== 'boolean')) return null
  const records: ProfessionalSourceRecord[] = []
  for (const [index, record] of input.records.entries()) {
    if (!object(record) || !exactKeys(record, ['id', 'section', 'text', 'order']) || record.id !== `r${index + 1}` ||
        record.order !== index || !PROFESSIONAL_SECTIONS.includes(record.section as ProfessionalSection) ||
        typeof record.text !== 'string' || !record.text.trim() || record.text.length > PROFESSIONAL_PROJECTION_LIMITS.sectionCharacters ||
        record.text !== record.text.trim()) return null
    records.push({ id: record.id as string, section: record.section as ProfessionalSection, text: record.text, order: index })
  }
  const characters = records.reduce((sum, record) => sum + record.text.length, 0)
  if (characters > PROFESSIONAL_PROJECTION_LIMITS.providerCharacters) return null
  const text = detectionText(records.map(record => record.text).join('\n'))
  if (instructionRisk.test(text) || unsafeCharacters.test(records.map(record => record.text).join('\n')) ||
      contactRisk.test(text) || phoneRisk.test(text) || hasIdentityRisk(text) || protectedRisk.test(text)) return null
  const anyOmissions = Object.values(input.omissions).some(Boolean)
  if ((records.length === 0) !== (input.coverage === 'none') ||
      (input.coverage === 'full' && anyOmissions) ||
      (input.overallQualityScoreAllowed && (input.coverage !== 'full' || !hasAdequateProfessionalText(records)))) return null
  return deepFreeze({ records, coverage: input.coverage as ProfessionalProjectionData['coverage'],
    omissions: { professionalContent: input.omissions.professionalContent as boolean,
      unclassifiedContent: input.omissions.unclassifiedContent as boolean, limitReached: input.omissions.limitReached as boolean },
    overallQualityScoreAllowed: input.overallQualityScoreAllowed })
}
