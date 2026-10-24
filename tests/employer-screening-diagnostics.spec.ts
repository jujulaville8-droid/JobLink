// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { reviewV2FailureEvent } from '../src/lib/employer-screening/inline-diagnostics'

describe('reviewV2FailureEvent', () => {
  it.each([
    ['Review usage unavailable', 'review_v2_usage_invalid'],
    ['Review dispatch expired', 'review_v2_dispatch_expired'],
    ['Review response unavailable', 'review_v2_response_unavailable'],
    ['Review response limit', 'review_v2_response_limit'],
    ['Résumé review response limit', 'review_v2_response_limit'],
    ['Review output unavailable', 'review_v2_output_unavailable'],
    ['Invalid résumé review context', 'review_v2_context_invalid'],
    ['Invalid review scope', 'review_v2_invalid_scope'],
    ['Unknown, duplicate or non-assessable review citation', 'review_v2_citation_invalid'],
    ['Incomplete review dimensions', 'review_v2_dimensions_invalid'],
    ['Missing evidence cannot be inferred from incomplete input', 'review_v2_dimensions_invalid'],
    ['Gap requires role scope and a single verification question', 'review_v2_findings_invalid'],
    ['Duplicate or conflicting review claims', 'review_v2_claims_invalid'],
    ['Overview requires an admitted professional source', 'review_v2_overview_invalid'],
  ])('maps %j to %s', (message, event) => {
    expect(reviewV2FailureEvent(new Error(message))).toBe(event)
  })

  it('classifies a schema rejection separately from rule failures', () => {
    const zodLike = Object.assign(new Error('[{"path":["dimensions"]}]'), { name: 'ZodError' })
    expect(reviewV2FailureEvent(zodLike)).toBe('review_v2_response_schema')
  })

  it('keeps unknown and non-error failures generic', () => {
    expect(reviewV2FailureEvent(new Error('socket hang up'))).toBe('review_v2_failed')
    expect(reviewV2FailureEvent('Review usage unavailable')).toBe('review_v2_failed')
    expect(reviewV2FailureEvent(undefined)).toBe('review_v2_failed')
  })
})
