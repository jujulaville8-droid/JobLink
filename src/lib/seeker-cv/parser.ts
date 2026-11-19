import { applicantCvPath } from '../applicant-cv-path'
import { extractPdfResume, PDF_EXTRACTION_LIMITS, type PdfDiagnosticEvent } from '../employer-screening/pdf-extraction'
import { readResumeWithVision, type VisionReadOutcome } from '../employer-screening/vision-extraction'
import { projectCv } from './projection'

export type CvParseStatus = 'parsed' | 'no_cv' | 'unreadable' | 'empty' | 'pending'
export type CvSource = { id: string; user_id: string; cv_url: string | null; updated_at: string; cv_parse_status: CvParseStatus; cv_parsed_at: string | null }
export type CvResult = { cv_skills: string[]; cv_roles: string[]; cv_parse_status: CvParseStatus; cv_parsed_at: string | null }
export type DownloadCv = (path: string) => Promise<Uint8Array | null>

export async function parseSeekerCv(profile: CvSource, download: DownloadCv,
  extract: typeof extractPdfResume = extractPdfResume,
  vision: (bytes: Uint8Array) => Promise<VisionReadOutcome> = readResumeWithVision): Promise<CvResult> {
  const result = (status: CvParseStatus, claims = { cv_skills: [] as string[], cv_roles: [] as string[] }): CvResult => ({
    ...claims, cv_parse_status: status, cv_parsed_at: status === 'pending' ? null : new Date().toISOString(),
  })
  if (!profile.cv_url) return result('no_cv')
  const path = applicantCvPath(profile.cv_url, profile.user_id)
  if (!path || !/\.(pdf|jpe?g|png)$/i.test(path)) return result('unreadable')
  // Download outages are retryable; malformed/unsupported files are terminal.
  let bytes: Uint8Array | null
  try { bytes = await download(path) } catch { return result('pending') }
  if (!bytes || bytes.byteLength > PDF_EXTRACTION_LIMITS.bytes) return result('unreadable')
  const readVision = async (legacy: 'empty' | 'unreadable'): Promise<CvResult> => {
    try {
      const outcome = await vision(bytes)
      if (outcome.status === 'disabled') return result(legacy)
      if (outcome.status === 'unavailable') return result('pending')
      if (outcome.status === 'no_text') return result('empty')
      const claims = projectCv(outcome.extraction)
      return claims.cv_skills.length || claims.cv_roles.length ? result('parsed', claims) : result('unreadable')
    } catch { return result('pending') }
  }
  if (!/\.pdf$/i.test(path)) return readVision('unreadable')
  const diagnostics: PdfDiagnosticEvent[] = []
  try {
    const extraction = await extract(bytes, { onDiagnostic: event => diagnostics.push(event) })
    if (!extraction) {
      if (diagnostics.includes('pdf_empty')) return readVision('empty')
      if (diagnostics.some(event => ['pdf_capacity_unavailable', 'pdf_aborted', 'pdf_module_failed', 'pdf_resolve_failed'].includes(event))) return result('pending')
      if (!diagnostics.includes('pdf_unsupported') && diagnostics.some(event => ['pdf_timeout', 'pdf_parse_failed'].includes(event))) return readVision('unreadable')
      return result('unreadable')
    }
    if (!extraction.evidence.length && !extraction.context?.length && extraction.omittedContext) return result('unreadable')
    const claims = projectCv(extraction)
    // Readable but unsupported vocabulary/projection failure is unavailable,
    // never a successful parse with an apparently authoritative empty skill set.
    return claims.cv_skills.length || claims.cv_roles.length ? result('parsed', claims) : result('unreadable')
  } catch { return result('unreadable') }
}
