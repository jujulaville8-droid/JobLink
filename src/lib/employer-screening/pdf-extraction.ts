/**
 * Local text-PDF extraction. Only reviewed skill / professional / credential claims become
 * evidence. Decoded pages are local-only quality input, NEVER provider input.
 *
 * Requires Node >=22.13 and the exact-pinned Mozilla pdfjs-dist dependency. The
 * parser runs in a disposable worker, not on the request event loop. Its V8 heap,
 * input, output and lifetime are bounded. Node's resourceLimits do NOT impose an
 * OS/RSS/ArrayBuffer sandbox; never describe this as one. No rendering, OCR,
 * external fonts/resources, document scripts, attachments or annotation actions
 * are requested. A parser limitation means unavailable, never a score of zero.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { SCREENING_SKILL_ALIASES, canonicalScreeningEvidence, screeningEvidenceQualifiers, validateMinimizedExtraction, type MinimizedExtraction, type ScreeningEvidenceQualifiers, isSafeProfessionalRecord, SCREENING_DERIVED_CONTEXT, type ScreeningContext } from './privacy'

export const PDF_EXTRACTION_LIMITS = Object.freeze({
  bytes: 5 * 1024 * 1024, pages: 20, pageCharacters: 30_000, totalCharacters: 120_000,
  textItems: 20_000, budgetMs: 3_000, concurrent: 2,
})
export const PDF_DIAGNOSTIC_EVENTS = ['pdf_input_rejected', 'pdf_capacity_unavailable', 'pdf_aborted',
  'pdf_framing_invalid', 'pdf_resolve_failed', 'pdf_module_failed', 'pdf_worker_failed',
  'pdf_timeout', 'pdf_unsupported', 'pdf_parse_failed', 'pdf_empty'] as const
export type PdfDiagnosticEvent = typeof PDF_DIAGNOSTIC_EVENTS[number]
export type PdfExtractionOptions = Readonly<{
  signal?: AbortSignal; budgetMs?: number
  /** Request-local, fixed-code diagnostics only. No input/error details. */
  onDiagnostic?: (event: PdfDiagnosticEvent) => void
  /** Trusted capture only: exact inert metadata fields from the SAME detached
   * structured CV rendered to these bytes. Never accept these hints from a
   * request body/upload or include descriptions, skill/certificate names/status. */
  trustedBuilderMetadata?: Readonly<{ sourceSha256: string; lines: readonly string[] }>
}>
function pdfDiagnostic(options: PdfExtractionOptions, event: PdfDiagnosticEvent): void {
  try { options.onDiagnostic?.(event) } catch { /* Diagnostics are nonessential. */ }
}

// A constant, trusted bootstrap, never interpolated PDF text. In Node, PDF.js's
// in-process fallback stays INSIDE this separate, terminable worker.
const PARSER_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const deny = () => { throw new Error('External PDF resources disabled'); };
globalThis.fetch = deny;
globalThis.XMLHttpRequest = undefined;
globalThis.WebSocket = undefined;
// Defense in depth. No PDF JavaScript evaluator/viewer is imported or invoked.
globalThis.eval = deny;
const originalFunction = globalThis.Function;
function DisabledFunction() { return deny(); }
DisabledFunction.prototype = originalFunction.prototype;
globalThis.Function = DisabledFunction;
class NoResources { async fetch() { return deny(); } }
class NoCanvas { create() { return deny(); } reset() { return deny(); } destroy() {} }
(async () => {
  let task;
  let failureCode = 'pdf_module_failed';
  try {
    const { getDocument } = await import(workerData.parserUrl);
    failureCode = 'pdf_parse_failed';
    const sourceSha256 = createHash('sha256').update(workerData.bytes).digest('hex');
    task = getDocument({
      data: workerData.bytes, verbosity: 0, stopAtErrors: true,
      isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
      useWorkerFetch: false, useWasm: false, enableXfa: false,
      disableRange: true, disableStream: true, disableAutoFetch: true,
      isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
      maxImageSize: 0, canvasMaxAreaInBytes: 0, fontExtraProperties: false,
      BinaryDataFactory: NoResources, CanvasFactory: NoCanvas,
    });
    // Passwords are neither accepted nor requested, including encrypted PDFs
    // which permit opening with an empty user password.
    const pdf = await task.promise;
    if (pdf.isPureXfa || pdf.numPages < 1 || pdf.numPages > workerData.limits.pages ||
        await pdf.getPermissions() !== null) { failureCode = 'pdf_unsupported'; throw new Error('Unsupported PDF'); }
    const pages = [];
    let totalCharacters = 0;
    let textItems = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const reader = page.streamTextContent({ disableNormalization: true, includeMarkedContent: false }).getReader();
      let text = '';
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (typeof item.str !== 'string') continue;
            if (++textItems > workerData.limits.textItems) throw new Error('PDF item limit');
            // Preserve PDF.js's exact decoded characters. The only generated
            // character is LF at its explicit end-of-line boundary.
            const next = item.str + (item.hasEOL ? '\n' : '');
            if (text.length + next.length > workerData.limits.pageCharacters ||
                totalCharacters + next.length > workerData.limits.totalCharacters) throw new Error('PDF text limit');
            text += next;
            totalCharacters += next.length;
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      pages.push(text);
      page.cleanup();
    }
    await task.destroy();
    task = null;
    parentPort.postMessage({ sourceSha256, pages });
  } catch {
    // Never log PDF text, metadata, exceptions containing input, or source IDs.
    if (task) await task.destroy().catch(() => {});
    parentPort.postMessage({ diagnostic: failureCode });
  }
})();
`

const parsedPdfSchema = z.object({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pages: z.array(z.string().max(PDF_EXTRACTION_LIMITS.pageCharacters)).min(1).max(PDF_EXTRACTION_LIMITS.pages),
}).strict().refine(value => value.pages.reduce((sum, page) => sum + page.length, 0) <= PDF_EXTRACTION_LIMITS.totalCharacters)
const trustedMetadataSchema = z.object({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  lines: z.array(z.string().min(1).max(300).refine(value => value === value.trim() && !/[\r\n\x00-\x1f\x7f]/.test(value))).max(150),
}).strict().refine(value => value.lines.reduce((sum, line) => sum + line.length, 0) <= 30_000)
const aliases = new Set(SCREENING_SKILL_ALIASES.map(alias => alias.toLowerCase()))
const skillsHeading = /^(?:skills|technical skills|core skills|key skills|professional skills):?$/i
let activeParsers = 0

/** No fuzzy matching, Unicode normalization or substring matches in prose. */
function minimizeSkillPages(pages: readonly string[], sourceSha256: string): MinimizedExtraction | null {
  const evidence: MinimizedExtraction['evidence'] = []
  for (const [pageIndex, page] of pages.entries()) {
    let inSkills = false
    let offset = 0
    for (const line of page.split('\n')) {
      const leading = line.match(/^ */)?.[0].length ?? 0
      const trimmed = line.slice(leading).replace(/ +$/, '')
      if (skillsHeading.test(trimmed)) inSkills = true
      else if (trimmed && inSkills) {
        // Entire lines must consist solely of allowlisted skills and ordinary
        // list punctuation. Mixed prose/directives/negations invalidate the line
        // and end the section; never cherry-pick a skill out of unsafe content.
        const parts = [...trimmed.matchAll(/[^,;|\u2022]+/g)]
        const candidates = parts.map(part => {
          const padding = part[0].match(/^ *(?:[-\u2022] +)?/)?.[0].length ?? 0
          const excerpt = part[0].slice(padding).replace(/ +$/, '')
          return { excerpt, start: offset + leading + (part.index ?? 0) + padding }
        })
        if (!candidates.length || candidates.some(c => !aliases.has(c.excerpt.toLowerCase()))) inSkills = false
        else for (const { excerpt, start } of candidates) {
          if (evidence.length >= 50) return null
          const end = start + excerpt.length
          // Quote and UTF-16 offsets bind to this exact page, not a model's claim.
          if (page.slice(start, end) !== excerpt) return null
          evidence.push({ id: `skill_${evidence.length + 1}`, category: 'skill', excerpt,
            location: `pdf.page[${pageIndex + 1}].span[${start}:${end}]` })
        }
      }
      offset += line.length + 1
    }
  }
  return evidence.length ? validateMinimizedExtraction({ sourceSha256, evidence }, sourceSha256) : null
}

/** Snapshot bytes synchronously; caller mutation, cancellation and parser errors
 * cannot alter an already-bound capture or delay ordinary baseline forwarding. */
async function parseBoundedPdf(input: Uint8Array, options: PdfExtractionOptions = {}): Promise<z.infer<typeof parsedPdfSchema> | null> {
  const budgetMs = options.budgetMs ?? PDF_EXTRACTION_LIMITS.budgetMs
  if (!(input instanceof Uint8Array) || input.byteLength < 8 || input.byteLength > PDF_EXTRACTION_LIMITS.bytes ||
      !Number.isSafeInteger(budgetMs) || budgetMs <= 0 || budgetMs > PDF_EXTRACTION_LIMITS.budgetMs) {
    pdfDiagnostic(options, 'pdf_input_rejected'); return null
  }
  if (options.signal?.aborted) { pdfDiagnostic(options, 'pdf_aborted'); return null }
  if (activeParsers >= PDF_EXTRACTION_LIMITS.concurrent) { pdfDiagnostic(options, 'pdf_capacity_unavailable'); return null }
  const bytes = Uint8Array.from(input)
  if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') { pdfDiagnostic(options, 'pdf_framing_invalid'); return null }
  // Do not let PDF.js's recovery mode turn a visibly truncated upload into
  // seemingly complete evidence. This is a framing check, not a PDF parser.
  if (!/%%EOF[\x00\t\n\f\r ]*$/.test(Buffer.from(bytes.subarray(-1024)).toString('latin1'))) { pdfDiagnostic(options, 'pdf_framing_invalid'); return null }
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
  activeParsers++
  let failureCode: PdfDiagnosticEvent = 'pdf_resolve_failed'
  try {
    const runtimeRequire = createRequire(join(process.cwd(), 'package.json'))
    const parserUrl = pathToFileURL(runtimeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    failureCode = 'pdf_worker_failed'
    const result = await new Promise<unknown>(resolve => {
      let worker: Worker | undefined
      let settled = false
      const finish = (value: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        // Await termination before releasing a concurrency slot. Late results
        // cannot race a timeout or leak unbounded background parser work.
        if (worker) void worker.terminate().then(() => resolve(value), () => resolve(null))
        else resolve(value)
      }
      const abort = () => { if (!settled) pdfDiagnostic(options, 'pdf_aborted'); finish(null) }
      const timer = setTimeout(() => { if (!settled) pdfDiagnostic(options, 'pdf_timeout'); finish(null) }, budgetMs)
      options.signal?.addEventListener('abort', abort, { once: true })
      try {
        worker = new Worker(PARSER_WORKER, {
          eval: true, env: {}, execArgv: [], stdout: true, stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
          workerData: { bytes, parserUrl, limits: PDF_EXTRACTION_LIMITS }, transferList: [bytes.buffer],
        })
        // Drain without logging, even dependency warnings cannot disclose input.
        worker.stdout.resume(); worker.stderr.resume()
        worker.once('message', value => {
          if (settled) return
          if (value && typeof value === 'object' && Object.hasOwn(value, 'diagnostic')) {
            const code: unknown = value.diagnostic
            if ((PDF_DIAGNOSTIC_EVENTS as readonly unknown[]).includes(code)) pdfDiagnostic(options, code as PdfDiagnosticEvent)
            finish(null)
          } else finish(value)
        })
        const failed = () => { if (!settled) pdfDiagnostic(options, 'pdf_worker_failed'); finish(null) }
        worker.once('error', failed)
        worker.once('exit', failed)
        if (options.signal?.aborted) abort()
      } catch { pdfDiagnostic(options, 'pdf_worker_failed'); finish(null) }
    })
    if (options.signal?.aborted || result === null) return null
    failureCode = 'pdf_parse_failed'
    const parsed = parsedPdfSchema.parse(result)
    if (parsed.sourceSha256 !== sourceSha256) return null
    return parsed
  } catch { pdfDiagnostic(options, failureCode); return null }
  finally { activeParsers-- }
}


export type PdfResumeExtraction = Readonly<MinimizedExtraction & {
  /** Sensitive LOCAL-ONLY structural input. Never persist in a snapshot, send to
   * a provider, log, or include in a screening report. Discard after local quality. */
  localPages: readonly string[]
}>
type EvidenceCategory = MinimizedExtraction['evidence'][number]['category']
type Section = EvidenceCategory | 'context' | 'other'
const experienceHeading = /^(?:experience|work experience|professional experience|relevant experience|employment history|work history|career history|projects|selected projects|professional projects):?$/i
const credentialHeading = /^(?:certifications?|credentials?|certificates?|licences? and certifications?|licenses? and certifications?|training and certifications?):?$/i
const contextHeading = /^(?:summary|professional summary|profile|objective|career objective|notes|disclaimer|statement|about me):?$/i
const otherHeading = /^(?:education|academic qualifications|qualifications|references|contact|contact details|personal details|interests|hobbies|languages|awards|achievements|volunteering|memberships):?$/i
const spacedHeadings = new Map(['Skills', 'Experience', 'Projects', 'Certifications', 'Education', 'Summary', 'References', 'Languages', 'Awards'].map(value => [value.toUpperCase().split('').join(' '), value]))
const sectionOf = (input: string): Section | null => {
  const value = spacedHeadings.get(input) ?? input
  return skillsHeading.test(value) ? 'skill'
  : experienceHeading.test(value) ? 'relevant_experience' : credentialHeading.test(value) ? 'job_certification'
    : contextHeading.test(value) ? 'context' : otherHeading.test(value) ? 'other' : null
}
const claimPrefix = { skill: 'skill', relevant_experience: 'experience', job_certification: 'credential' } as const

// Reviewed source-scope statements are projected as finite qualifiers, never raw
// text. Unknown scope is retained as uncertainty rather than ignored. Scope does
// not reset at a repeated heading or page break.
type Scope = Partial<ScreeningEvidenceQualifiers>
const scopeStatements: ReadonlyArray<readonly [string, Scope]> = [
  ['Tasks performed by my supervisor', { attribution: 'other', context: 'performed' }],
  ['Tasks performed by my colleague', { attribution: 'other', context: 'performed' }],
  ['Certificates held by my supervisor', { attribution: 'other' }],
  ['Responsibilities I have yet to perform', { context: 'requirement', assertion: 'uncertain' }],
  ['Would perform the following tasks', { context: 'requirement', assertion: 'uncertain' }],
  ['These are future duties', { context: 'requirement', assertion: 'uncertain' }],
  ['Training only', { context: 'training' }],
  ['Course attendance only', { context: 'training', assertion: 'uncertain' }],
  ['Copied from an online vacancy', { attribution: 'unknown', context: 'requirement', assertion: 'uncertain' }],
  ['Duties outside my role', { attribution: 'other', context: 'unknown', assertion: 'uncertain' }],
  ['Did not perform these duties', { assertion: 'negated' }],
  ['These duties are not my experience', { assertion: 'negated' }],
  ['I have no work experience', { assertion: 'negated' }],
  ['No relevant experience', { assertion: 'negated' }],
  ['These are hypothetical examples', { context: 'requirement', assertion: 'uncertain' }],
  ['This is a sample only', { attribution: 'unknown', context: 'requirement', assertion: 'uncertain' }],
  ['Expired', { credentialStatus: 'expired' }],
  ['Status: expired', { credentialStatus: 'expired' }],
  ['Status: cancelled', { credentialStatus: 'cancelled' }],
  ['Status: canceled', { credentialStatus: 'cancelled' }],
  ['Cancelled', { credentialStatus: 'cancelled' }],
  ['Canceled', { credentialStatus: 'cancelled' }],
  ['In progress', { context: 'training', credentialStatus: 'in_progress' }],
  ['Currently pursuing', { context: 'training', credentialStatus: 'in_progress' }],
]
const knownScope = new Map<string, Scope>()
for (const [statement, scope] of scopeStatements) for (const suffix of ['', ':', '.']) knownScope.set((statement + suffix).toLowerCase(), scope)
// Exclusions are monotonic. Conflicting negative statuses cannot collapse to
// unknown and bypass a downstream hard exclusion.
const mergeScope = (left: Scope, right: Scope): Scope => {
  const result = { ...left }
  const priority = {
    attribution: ['applicant', 'unknown', 'other'],
    context: ['performed', 'declaration', 'unknown', 'requirement', 'training'],
    assertion: ['affirmed', 'uncertain', 'negated'],
    credentialStatus: ['not_applicable', 'claimed_attainment', 'claimed_current', 'unknown', 'in_progress', 'expired', 'cancelled'],
  } as const
  for (const field of ['attribution', 'context', 'assertion', 'credentialStatus'] as const) {
    const value = right[field]
    if (value === undefined) continue
    const existing = result[field]
    const ranks: readonly string[] = priority[field]
    const merged = existing === undefined || ranks.indexOf(value) > ranks.indexOf(existing) ? value : existing
    Object.assign(result, { [field]: merged })
  }
  return result
}
function qualifyClaim(intrinsic: ScreeningEvidenceQualifiers, scope: Scope, category: EvidenceCategory): ScreeningEvidenceQualifiers {
  const result = { ...intrinsic }
  for (const field of ['attribution', 'context', 'assertion'] as const) {
    if (scope[field] === undefined) continue
    const neutral = field === 'attribution' ? 'applicant' : field === 'assertion' ? 'affirmed'
      : category === 'relevant_experience' ? 'performed' : 'declaration'
    const next = result[field] === neutral ? scope[field] : mergeScope({ [field]: result[field] }, { [field]: scope[field] })[field]
    Object.assign(result, { [field]: next })
  }
  if (category === 'job_certification' && scope.credentialStatus !== undefined) {
    // Context may invalidate a claim but cannot create attainment/current status.
    result.credentialStatus = mergeScope({ credentialStatus: result.credentialStatus }, { credentialStatus: scope.credentialStatus }).credentialStatus!
  }
  return result
}
const reviewedRoles = new Set([
  'front desk assistant', 'front desk agent', 'receptionist', 'guest service agent', 'reservation agent',
  'hotel receptionist', 'customer service representative', 'customer service assistant', 'cashier',
  'sales assistant', 'store clerk', 'stock clerk', 'warehouse assistant', 'inventory clerk',
  'waiter', 'waitress', 'server', 'restaurant server', 'bartender', 'bar attendant', 'cook', 'chef',
  'kitchen assistant', 'housekeeper', 'room attendant', 'cleaner', 'housekeeping attendant',
  'office assistant', 'administrative assistant', 'administrative officer', 'office administrator',
  'clerk', 'data entry clerk', 'accounts clerk', 'bookkeeper', 'payroll officer', 'accounts assistant',
  'electrician', 'electrical assistant', 'electrical technician', 'plumber', 'plumbing assistant',
  'carpenter', 'carpentry assistant', 'mason', 'painter', 'maintenance technician', 'maintenance assistant',
  'hvac technician', 'refrigeration technician', 'construction worker', 'general labourer', 'general laborer',
  'apprentice electrician', 'apprentice plumber',
])
const dateLine = /^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) +)?(?:19|20)\d{2}(?:[-/]\d{2})?(?: *(?:-|\u2013|\u2014|to) *(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) +)?(?:19|20)\d{2}(?:[-/]\d{2})?|Present|Current))?$/i
// An arbitrary labeled sentence is NOT metadata. These narrow local-only proper
// name forms do not assert identity; unsupported names/prose stay uncertain.
const properNameWords = (value: string) => value.length > 0 && value.length <= 100 && value.split(' ').length <= 12 &&
  value.split(' ').every(word => /^(?:[A-Z][A-Za-z0-9'&()-]*|[A-Z]\.|&|and|of|the)$/.test(word)) &&
  !/\b(?:This|These|Those|My|Our|Your|His|Her|Their|Its|I|We|They|He|She|Belongs?|Tasks?|Duties|Responsibilities|Performed|Owned|Held|Supervisor|Manager|Colleague|Brother|Sister|Copied|Status|Expired|Cancelled|Canceled|Training|Only|Yet|Not|Never|Ignore|Instructions?|To|By|For|From|Without|Outside)\b/i.test(value)
const boundedOrganization = (value: string) => properNameWords(value) &&
  /(?:Hotel|Resort|Restaurant|Services|Supply|Supplies|Construction|Electrical|Plumbing|Market|Supermarket|Ltd|Limited|Inc|Company|Co|Associates|Agency|School|College|University|Institute|Academy|Authority|Board|Council|Centre|Center|Foundation|Association|Project|Cross)\.?$/.test(value)
function inertProfessionalMetadata(text: string): boolean {
  if (reviewedRoles.has(text.toLowerCase()) || dateLine.test(text)) return true
  const labeled = /^(?:Employer|Company|Issuer|Project): (.+)$/.exec(text)
  if (labeled) return boundedOrganization(labeled[1])
  const parts = text.split(/ +\| +/)
  return (parts.length === 2 || parts.length === 3) && reviewedRoles.has(parts[0].toLowerCase()) &&
    boundedOrganization(parts[1]) && (parts.length === 2 || dateLine.test(parts[2]))
}

/** Strong, bounded scope cues are only conservative qualifiers. General safe
// professional language is retained for model interpretation, never asserted to
// have been semantically proven by these local patterns. */
function explicitScope(value: string): Scope {
  let scope: Scope = knownScope.get(value.toLowerCase()) ?? {}
  if (/\b(?:belongs? to|held by|performed by|done by|work of|employment of)\b.*\b(?:my|our|the|another|other|his|her|their)\b/i.test(value)) scope = mergeScope(scope, { attribution: 'other' })
  if (/\b(?:did not|didn't|do not|don't|cannot|can't|have not|never performed|not my experience|not my work|not mine|no work experience|no relevant experience)\b/i.test(value)) scope = mergeScope(scope, { assertion: 'negated' })
  if (/\b(?:training only|course attendance only|training rather than|practice only)\b/i.test(value)) scope = mergeScope(scope, { context: 'training' })
  if (/\b(?:yet to perform|future duties|job requirements|would perform|expected to)\b|copied from.*vacancy/i.test(value)) scope = mergeScope(scope, { context: 'requirement', assertion: 'uncertain' })
  if (/\b(?:expired|cancelled|canceled)\b/i.test(value)) scope = mergeScope(scope, { credentialStatus: /\bexpired\b/i.test(value) ? 'expired' : 'cancelled' })
  if (/\b(?:in progress|currently pursuing)\b/i.test(value)) scope = mergeScope(scope, { credentialStatus: 'in_progress', context: 'training' })
  return scope
}
function derivedContext(scope: Scope): string | null {
  if (scope.attribution === 'other') return SCREENING_DERIVED_CONTEXT.other
  if (scope.assertion === 'negated') return SCREENING_DERIVED_CONTEXT.negated
  if (scope.context === 'training') return SCREENING_DERIVED_CONTEXT.training
  if (scope.context === 'requirement') return SCREENING_DERIVED_CONTEXT.requirement
  if (scope.credentialStatus === 'expired' || scope.credentialStatus === 'cancelled') return SCREENING_DERIVED_CONTEXT.credential
  return null
}
function minimizeResumePages(pages: readonly string[], sourceSha256: string, trustedMetadata: ReadonlySet<string> = new Set()): MinimizedExtraction | null {
  const evidence: MinimizedExtraction['evidence'] = []
  const context: ScreeningContext[] = []
  let omittedContext = false
  let previousOmission = false
  let globalScope: Scope = {}
  const sectionScopes: Record<EvidenceCategory, Scope> = { skill: {}, relevant_experience: {}, job_certification: {} }
  const addContext = (kind: ScreeningContext['kind'], excerpt: string, page: number, start: number, end: number) => {
    const previous = context.at(-1)
    if (kind === 'omitted' && previousOmission && previous?.location.startsWith(`pdf.page[${page}].`)) {
      previous.location = previous.location.replace(/:[0-9]+\]$/, `:${end}]`)
      return
    }
    previousOmission = kind === 'omitted'
    if (context.length >= 20) throw new Error('Professional context limit')
    context.push({ id: `context_${context.length + 1}`, kind, excerpt, location: `pdf.page[${page}].span[${start}:${end}]` })
  }
  for (const [pageIndex, page] of pages.entries()) {
    let offset = 0
    let section: Section = 'context'
    for (const raw of page.split('\n')) {
      const leading = raw.match(/^ */)?.[0].length ?? 0
      const line = raw.slice(leading).replace(/ +$/, '')
      const lineStart = offset + leading
      offset += raw.length + 1
      if (!line) continue
      const heading = sectionOf(line)
      if (heading) { section = heading; previousOmission = false; continue }
      const padding = line.match(/^(?:[-\u2022] +)/)?.[0].length ?? 0
      const text = line.slice(padding)
      const start = lineStart + padding
      const end = start + text.length
      if (section === 'skill') {
        const parts = [...text.matchAll(/[^,;|\u2022\u00b7]+/g)].map(part => {
          const spaces = part[0].match(/^ */)?.[0].length ?? 0
          return { excerpt: part[0].slice(spaces).replace(/ +$/, ''), start: start + (part.index ?? 0) + spaces }
        })
        if (parts.length && parts.every(part => canonicalScreeningEvidence(part.excerpt, 'skill'))) {
          previousOmission = false
          for (const part of parts) {
            if (evidence.length >= 50) return null
            evidence.push({ id: `skill_${evidence.length + 1}`, category: 'skill', excerpt: part.excerpt,
              location: `pdf.page[${pageIndex + 1}].span[${part.start}:${part.start + part.excerpt.length}]`,
              qualifiers: screeningEvidenceQualifiers(part.excerpt, 'skill')!,
            })
          }
          continue
        }
      }
      const scope = explicitScope(text)
      const scopeText = derivedContext(scope)
      const safe = isSafeProfessionalRecord(text) || (section !== 'other' && section !== 'context' && Boolean(canonicalScreeningEvidence(text, section)))
      // Exact typed metadata is not permission to ignore applicant-written
      // disclaimers. Derive any strong scope before omitting identity-bearing rows.
      const metadata = trustedMetadata.has(text) || inertProfessionalMetadata(text) || dateLine.test(text)
      const isContext = section === 'context' || section === 'other' || metadata || Boolean(knownScope.get(text.toLowerCase()))
      if (isContext || !safe) {
        if (Object.keys(scope).length) {
          if (section === 'context' || section === 'other') globalScope = mergeScope(globalScope, scope)
          else sectionScopes[section] = mergeScope(sectionScopes[section], scope)
        }
        if (safe && !metadata) addContext('professional_context', text, pageIndex + 1, start, end)
        else if (scopeText) addContext('derived_attribution', scopeText, pageIndex + 1, start, end)
        else {
          omittedContext = true
          addContext('omitted', SCREENING_DERIVED_CONTEXT.omitted, pageIndex + 1, start, end)
        }
        continue
      }
      if (section === 'other' || section === 'context') continue
      if (evidence.length >= 50) return null
      previousOmission = false
      const intrinsic = screeningEvidenceQualifiers(text, section)
      const statementScope = Object.keys(scope).length ? scope : null
      evidence.push({ id: `${claimPrefix[section]}_${evidence.length + 1}`, category: section, excerpt: text,
        location: `pdf.page[${pageIndex + 1}].span[${start}:${end}]`,
        ...(intrinsic ? { qualifiers: statementScope ? qualifyClaim(intrinsic, statementScope, section) : intrinsic }
          : { interpretation: 'ai_contextual' as const, ...(statementScope ? { qualifiers: {
              attribution: 'unknown' as const, context: 'unknown' as const, assertion: 'uncertain' as const,
              credentialStatus: section === 'job_certification' ? 'unknown' as const : 'not_applicable' as const, ...statementScope,
            } } : {}) }),
      })
    }
  }
  // Context remains visible and in source order. Only strong explicit qualifiers
  // are propagated; ordinary omitted vocabulary does NOT erase all other work.
  for (const item of evidence) {
    const scope = mergeScope(globalScope, sectionScopes[item.category])
    if (!Object.keys(scope).length) continue
    item.qualifiers = qualifyClaim(item.qualifiers ?? {
      attribution: 'applicant', context: item.category === 'relevant_experience' ? 'performed' : 'declaration',
      assertion: 'affirmed', credentialStatus: item.category === 'job_certification' ? 'unknown' : 'not_applicable',
    }, scope, item.category)
  }
  return validateMinimizedExtraction({ sourceSha256, evidence, context, omittedContext }, sourceSha256)
}

/** Backward-compatible skill-only extraction. No professional/credential claims
 * or raw decoded pages are introduced into existing callers of this function. */
export async function extractPdfSkills(input: Uint8Array, options: PdfExtractionOptions = {}): Promise<MinimizedExtraction | null> {
  const parsed = await parseBoundedPdf(input, options)
  return parsed ? minimizeSkillPages(parsed.pages, parsed.sourceSha256) : null
}

/** One bounded parse supplies professional claims and local structural quality.
 * Unsupported readable text may have zero claims, permitting quality review
 * without manufacturing evidence. Corrupt/unreadable/over-limit sources are null.
 * All claims are applicant-reported and unverified; no OCR or generic NLP fallback. */
export async function extractPdfResume(input: Uint8Array, options: PdfExtractionOptions = {}): Promise<PdfResumeExtraction | null> {
  const parsed = await parseBoundedPdf(input, options)
  if (!parsed || options.signal?.aborted) return null
  if (!parsed.pages.some(page => page.trim())) { pdfDiagnostic(options, 'pdf_empty'); return null }
  let metadata: z.infer<typeof trustedMetadataSchema> | null
  try {
    metadata = options.trustedBuilderMetadata ? trustedMetadataSchema.parse(options.trustedBuilderMetadata) : null
    if (metadata && metadata.sourceSha256 !== parsed.sourceSha256) return null
  } catch { return null }
  let extraction: MinimizedExtraction | null = null
  try { extraction = minimizeResumePages(parsed.pages, parsed.sourceSha256, new Set(metadata?.lines ?? [])) }
  catch { /* A projection limit/validation failure does not corrupt readable pages. */ }
  if (options.signal?.aborted) return null
  return Object.freeze({
    ...(extraction ?? { sourceSha256: parsed.sourceSha256, evidence: [], context: [], omittedContext: true }),
    localPages: Object.freeze([...parsed.pages]),
  })
}
