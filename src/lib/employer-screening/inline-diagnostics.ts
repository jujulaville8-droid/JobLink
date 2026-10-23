/** Server-only diagnostics. Fixed codes and an opaque correlation, never inputs,
 * résumé data, provider responses, errors, addresses, storage paths or secrets. */
import 'server-only'
import { createHash } from 'node:crypto'
import { PDF_DIAGNOSTIC_EVENTS } from './pdf-extraction'

export const INLINE_DIAGNOSTIC_EVENTS = [
  'route_inline_disabled', 'route_notice_missing', 'route_notice_current',
  'attachment_missing', 'attachment_ready', 'entry_gates_disabled', 'entry_notice_missing',
  'attachment_invalid', 'parse_started', 'parse_unavailable', 'parse_failed',
  'quality_failed', 'paid_gate_disabled', 'evidence_invalid', 'evidence_empty',
  'job_load_failed', 'job_binding_mismatch', 'job_mapping_unavailable', 'snapshot_invalid',
  'job_mapping_not_published', 'job_mapping_unsupported_format', 'job_mapping_no_explicit_requirements',
  'job_mapping_unsupported_requirements', 'job_mapping_too_many_criteria',
  'provider_preflight_failed', 'budget_requested', 'budget_rpc_failed', 'budget_rejected',
  'budget_granted', 'dispatch_not_authorized', 'provider_request_started', 'provider_failed',
  'settlement_unconfirmed', 'assessment_invalid', 'scored', 'deadline_expired',
  'enrichment_failed', 'review_v2_failed', 'review_v2_gates_disabled', 'review_v2_notice_missing', 'review_v2_projection_empty',
  'review_v2_admission_requested', 'review_v2_admission_granted', 'review_v2_admission_denied',
  'review_v2_count_started', 'review_v2_count_validated', 'review_v2_completed',
  ...PDF_DIAGNOSTIC_EVENTS,
] as const
export type InlineDiagnosticEvent = typeof INLINE_DIAGNOSTIC_EVENTS[number]

/** Reason specific companion codes for job_mapping_unavailable, so log scans
 * can tell a stub listing from an over long one without reading the listing. */
export const JOB_MAPPING_REASON_EVENTS = {
  not_published: 'job_mapping_not_published',
  unsupported_format: 'job_mapping_unsupported_format',
  no_explicit_requirements: 'job_mapping_no_explicit_requirements',
  unsupported_requirements: 'job_mapping_unsupported_requirements',
  too_many_criteria: 'job_mapping_too_many_criteria',
} as const satisfies Record<string, InlineDiagnosticEvent>

export function inlineDiagnostic(event: InlineDiagnosticEvent, applicationId: string): void {
  try {
    // Runtime allowlist also protects against accidental untyped/raw error calls.
    if (!(INLINE_DIAGNOSTIC_EVENTS as readonly unknown[]).includes(event)) return
    const correlation = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(applicationId)
      ? createHash('sha256').update(`joblink-inline-diagnostic-v1:${applicationId.toLowerCase()}`).digest('hex').slice(0, 32)
      : 'unavailable'
    console.info('[employer-screening-inline]', JSON.stringify({ event, correlation }))
  } catch { /* Observability must never change screening or baseline delivery. */ }
}
