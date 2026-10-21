/**
 * Bounded selection of actual PUBLIC professional job clauses, without a model
 * call or implied employer approval. The single evidence call interprets whole
 * admitted clauses, including original qualifiers and negation. This is not a
 * general parser, PII redactor or whole-vacancy qualification test.
 */
import { createHash } from 'node:crypto'
import type { JobListing } from '../types'
import { publicVacancyDescription } from '../public-vacancy-description'
import type { Snapshot } from './index'
import { isSafePublishedJobClause, MAX_PUBLISHED_JOB_CLAUSE_CHARS, MAX_PUBLISHED_JOB_CONTEXT_CHARS,
  MAX_PUBLISHED_JOB_CRITERIA } from './inline-job-context'

export const PUBLISHED_JOB_CRITERIA_MAPPING_VERSION = 'published-context-v2'
type Criterion = Snapshot['rubric']['criteria'][number]
type Kind = 'required' | 'preferred' | 'duty'
type Section = Kind | 'mixed' | 'context' | 'ignored' | 'none'
export type PublishedJobCriteriaInput = Pick<JobListing, 'id' | 'company_id' | 'title' | 'description' | 'status'>
export type PublishedJobCriteriaResult = {
  status: 'available' | 'unavailable'; criteria: Criterion[]; versionId: string
  source: {
    kind: 'published_job_requirements'; descriptionSha256: string; mappingVersion: string; omittedContext: boolean
    context: { text: string; sourceOrder: number }[]
    provenance: ({ criterionId: string; kind: Kind; location: string; requirementSha256: string } |
      { contextId: string; kind: 'context'; location: string; requirementSha256: string })[]
  }
  coverage: {
    explicitRequiredClauses: number; recognizedRequiredClauses: number; unsupportedRequiredClauses: number
    explicitDutyClauses: number; recognizedDutyClauses: number; unsupportedDutyClauses: number
    explicitPreferredClauses: number; recognizedPreferredClauses: number; unsupportedPreferredClauses: number
    excludedOptionalClauses: number
  }
  weighting: { method: 'equal'; rounding: 'source_order_largest_remainder'; totalPoints: 100 }
  reason?: 'not_published' | 'unsupported_format' | 'no_explicit_requirements' | 'unsupported_requirements' | 'too_many_criteria'
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const headings: Readonly<Record<string, Section>> = {
  requirements: 'required', required: 'required', qualifications: 'required', 'job requirements': 'required',
  'required qualifications': 'required', 'minimum qualifications': 'required', 'required skills': 'required',
  'essential skills': 'required', 'essential requirements': 'required', 'what you need': 'required',
  'what we are looking for': 'required', 'what we’re looking for': 'required', "what we're looking for": 'required',
  responsibilities: 'duty', duties: 'duty', 'key responsibilities': 'duty', 'key duties': 'duty',
  'job duties': 'duty', 'your responsibilities': 'duty', 'duties and responsibilities': 'duty',
  'responsibilities and duties': 'duty', "what you'll do": 'duty', 'what you’ll do': 'duty',
  'requirements and responsibilities': 'mixed',
  'preferred qualifications': 'preferred', 'preferred skills': 'preferred', 'preferred experience': 'preferred',
  'desirable qualifications': 'preferred', 'desired qualifications': 'preferred', 'nice to have': 'preferred',
  advantages: 'preferred', 'advantages and training': 'preferred', 'optional qualifications': 'preferred',
  benefits: 'ignored', 'what we offer': 'ignored', compensation: 'ignored', commission: 'ignored', salary: 'ignored',
  'about us': 'ignored', 'about the company': 'ignored', 'how to apply': 'ignored', 'application instructions': 'ignored',
  'equal opportunity': 'ignored', 'learn more': 'ignored', 'apply before': 'ignored',
  notes: 'context', note: 'context', important: 'context', 'important notes': 'context',
  summary: 'context', clarification: 'context', clarifications: 'context', 'additional information': 'context',
}
const optional = /\b(?:preferred|preferable|optional|desirable|an advantage|a plus|nice to have|not (?:required|essential|a necessity))\b/i
const required = /\b(?:must|required|requires|require|essential|minimum|at least)\b/i
const dutyStart = /^(?:(?:you (?:will|would|must)|(?:duties|responsibilities) include|responsible for|do not|never|not required to|safely|accurately|efficiently)\s+)?(?:assist|answer|apply|arrange|assemble|audit|balance|build|calculate|check|clean|clear|collect|conduct|coordinate|cook|create|deliver|develop|document|drive|ensure|enter|file|fit|follow|give|greet|handle|help|identify|inspect|install|issue|lead|maintain|manage|measure|mix|monitor|operate|order|organise|organize|paint|perform|plan|prepare|process|provide|receive|reconcile|record|repair|replace|replenish|report|represent|reset|resolve|respond|schedule|sell|serve|service|set|stock|supervise|support|take|test|track|train|transport|update|use|welcome)\b/i
const professionalFragment = /^(?:experience (?:in|with)|(?:strong|excellent|basic|advanced|good) (?:knowledge|skills|communication)|(?:ability|able) to|(?:valid|current) (?:driver'?s? licen[cs]e|certification|certificate))\b/i
const credential = /\b(?:certificate|certification|certified|licen[cs]e|diploma|degree|accreditation|registered|qualification)\b/i
const waivedExperience = /^(?:no (?:previous |prior )?experience (?:is )?(?:required|necessary)|(?:previous |prior )?experience (?:is )?not (?:required|necessary))(?:[;,. ]|$)/i
const professionalTerms = /\b(?:duties|tasks|responsibilities|requirements|qualifications|skills|experience|role|position|job|manager|supervisor|training)\b/i
const scopeQualifier = /\b(?:above|below|following|these|those|listed|all|only|none|not|never|no|unless|except|instead|rather|belong|appl(?:y|ies)|examples?|optional|mandatory|prerequisites?)\b/i
const globalQualifier = /^(?:this|these|those|all|none|everything)\b.{0,100}\b(?:not|optional|mandatory|required|applies|apply|examples?|prerequisites?)\b/i

/**
 * Source spans are UTF-16 offsets into publicVacancyDescription(job). The result
 * contains no full description, employer, title, location or contact fields.
 * "Recognized" means admitted, NOT verified or exhaustive. Equal weights concern
 * admitted clauses only, never employer importance, eligibility or hiring.
 */
export function derivePublishedJobCriteria(job: PublishedJobCriteriaInput): PublishedJobCriteriaResult {
  const coverage: PublishedJobCriteriaResult['coverage'] = { explicitRequiredClauses: 0, recognizedRequiredClauses: 0,
    unsupportedRequiredClauses: 0, explicitDutyClauses: 0, recognizedDutyClauses: 0, unsupportedDutyClauses: 0,
    explicitPreferredClauses: 0, recognizedPreferredClauses: 0, unsupportedPreferredClauses: 0, excludedOptionalClauses: 0 }
  let description = '', omittedContext = false
  const contexts: { text: string; sourceOrder: number; end: number }[] = []
  const output = (reason?: PublishedJobCriteriaResult['reason'], criteria: Criterion[] = [],
    provenance: PublishedJobCriteriaResult['source']['provenance'] = []): PublishedJobCriteriaResult => ({
    status: reason ? 'unavailable' : 'available', criteria,
    versionId: `${PUBLISHED_JOB_CRITERIA_MAPPING_VERSION}:${hash(description)}`,
    source: { kind: 'published_job_requirements', descriptionSha256: hash(description),
      mappingVersion: PUBLISHED_JOB_CRITERIA_MAPPING_VERSION, omittedContext,
      context: contexts.map(({ text, sourceOrder }) => ({ text, sourceOrder })),
      provenance: [...provenance, ...contexts.map((context, index) => ({ contextId: `job_context_${index + 1}`,
        kind: 'context' as const, location: `public_description.span[${context.sourceOrder}:${context.end}]`,
        requirementSha256: hash(description.slice(context.sourceOrder, context.end)) }))] }, coverage,
    weighting: { method: 'equal', rounding: 'source_order_largest_remainder', totalPoints: 100 },
    ...(reason ? { reason } : {}),
  })
  if (!job || job.status !== 'active') return output('not_published')
  if (typeof job.description !== 'string' || typeof job.title !== 'string' || job.description.length > 32_000 ||
      job.title.length > 1000) return output('unsupported_format')
  description = publicVacancyDescription(job)
  if (description.length > 32_000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(description) ||
      description.split('\n').length > 200) return output('unsupported_format')
  const matches: { text: string; kind: Kind; start: number; end: number }[] = []
  let section: Section = 'none', offset = 0
  for (const raw of description.split('\n')) {
    const lineStart = offset
    offset += raw.length + 1
    const leading = /^(?:\s*(?:[-*•]|\d+[.)])\s+|\s*)/.exec(raw)![0].length
    let text = raw.slice(leading).trimEnd()
    let start = lineStart + leading
    if (!text) continue
    const decorated = text.replace(/^#{1,4}\s+/, '').replace(/^\*\*(.+?)\*\*(?=:|$)/, '$1')
    const colon = decorated.indexOf(':')
    const heading = (colon < 0 ? decorated : decorated.slice(0, colon)).replace(/:$/, '').trim().toLowerCase()
    if (Object.hasOwn(headings, heading)) {
      section = headings[heading]
      const content = colon < 0 ? '' : decorated.slice(colon + 1).trim()
      if (!content) continue
      start += text.lastIndexOf(content)
      text = content
    } else if (/^#{1,4}\s|^\*\*.+\*\*:?$/.test(text) || text.endsWith(':')) {
      if (section !== 'ignored' && section !== 'none') omittedContext = true
      section = 'none'
      continue
    }
    if (section === 'ignored') continue
    // Non-citable professional qualifiers remain in source order. They must not
    // become weighted criteria or disappear because they sit under Notes/Summary.
    const qualifier = waivedExperience.test(text) || globalQualifier.test(text) ||
      (professionalTerms.test(text) && scopeQualifier.test(text) &&
        (section === 'none' || section === 'context' || /\b(?:these|those|above|below|following|listed|belong|examples?|prerequisites?)\b/i.test(text)))
    if (qualifier) {
      if (text.length > MAX_PUBLISHED_JOB_CLAUSE_CHARS) return output('unsupported_format')
      if (isSafePublishedJobClause(text)) {
        contexts.push({ text, sourceOrder: start, end: start + text.length })
        if (contexts.length > 8) return output('unsupported_format')
      } else omittedContext = true
      continue
    }
    if (section === 'context') {
      // Context headings are not a route for sending arbitrary company prose.
      // An unresolved note may still change how the admitted job clauses apply.
      omittedContext = true
      continue
    }
    let kind: Kind | undefined
    // Preserve the whole clause and every qualifier, even in mixed wording.
    if (section === 'preferred') kind = 'preferred'
    else if (optional.test(text) && !/\b(?:must|required|requires|require|essential)\b/i.test(text.replace(/\bnot (?:required|essential|a necessity)\b/gi, ''))) kind = 'preferred'
    else if (required.test(text)) kind = 'required'
    else if (dutyStart.test(text)) kind = 'duty'
    else if (section === 'required' || section === 'mixed') kind = 'required'
    else if (section === 'duty') kind = 'duty'
    else if (professionalFragment.test(text)) kind = 'required'
    if (!kind) continue
    const count = kind === 'required' ? 'Required' : kind === 'duty' ? 'Duty' : 'Preferred'
    coverage[`explicit${count}Clauses`]++
    // Oversized context is never silently truncated or cherry-picked away.
    if (text.length > MAX_PUBLISHED_JOB_CLAUSE_CHARS) return output('unsupported_format')
    if (!isSafePublishedJobClause(text)) {
      omittedContext = true
      coverage[`unsupported${count}Clauses`]++
      if (kind === 'preferred') coverage.excludedOptionalClauses++
      continue
    }
    coverage[`recognized${count}Clauses`]++
    matches.push({ text, kind, start, end: start + text.length })
  }
  const distinct = matches.filter((match, index) => matches.findIndex(candidate =>
    candidate.kind === match.kind && candidate.text.toLowerCase() === match.text.toLowerCase()) === index)
  if (!distinct.length) return output(matches.length || omittedContext ? 'unsupported_requirements' : 'no_explicit_requirements')
  if (distinct.length > MAX_PUBLISHED_JOB_CRITERIA) return output('too_many_criteria')
  if ([...distinct, ...contexts].reduce((total, match) => total + match.text.length, 0) > MAX_PUBLISHED_JOB_CONTEXT_CHARS) return output('unsupported_format')
  const criteria: Criterion[] = distinct.map((match, index) => ({ id: `published_${index + 1}`, label: match.text,
    category: 'relevant_experience', interpretation: 'ai_contextual', importance: match.kind,
    sourceOrder: match.start,
    weight: Math.floor(100 / distinct.length) + (index < 100 % distinct.length ? 1 : 0),
    verificationRequired: credential.test(match.text) }))
  return output(undefined, criteria, matches.map(match => ({
    criterionId: criteria[distinct.findIndex(candidate => candidate.kind === match.kind &&
      candidate.text.toLowerCase() === match.text.toLowerCase())].id,
    kind: match.kind, location: `public_description.span[${match.start}:${match.end}]`,
    requirementSha256: hash(description.slice(match.start, match.end)),
  })))
}
