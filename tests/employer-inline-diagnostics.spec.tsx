// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INLINE_DIAGNOSTIC_EVENTS, inlineDiagnostic, type InlineDiagnosticEvent } from '../src/lib/employer-screening/inline-diagnostics'

afterEach(() => vi.restoreAllMocks())
describe('private bounded inline diagnostic events', () => {
  it('emits only an allowlisted event and derived opaque application correlation', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const application = '11111111-1111-4111-8111-111111111111'
    for (const event of INLINE_DIAGNOSTIC_EVENTS) inlineDiagnostic(event, application)
    expect(info).toHaveBeenCalledTimes(INLINE_DIAGNOSTIC_EVENTS.length)
    for (const [prefix, raw] of info.mock.calls) {
      expect(prefix).toBe('[employer-screening-inline]')
      const record = JSON.parse(String(raw))
      expect(Object.keys(record)).toEqual(['event', 'correlation'])
      expect(INLINE_DIAGNOSTIC_EVENTS).toContain(record.event)
      expect(record.correlation).toBe(createHash('sha256').update(`joblink-inline-diagnostic-v1:${application}`).digest('hex').slice(0, 32))
      expect(raw).not.toContain(application)
    }
  })
  it('does not accept raw errors, arbitrary codes or malformed identifiers as log content', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    inlineDiagnostic('private@example.test secret résumé' as InlineDiagnosticEvent, '11111111-1111-4111-8111-111111111111')
    expect(info).not.toHaveBeenCalled()
    inlineDiagnostic('evidence_empty', 'private@example.test cv/secret.pdf')
    expect(JSON.parse(String(info.mock.calls[0][1]))).toEqual({ event: 'evidence_empty', correlation: 'unavailable' })
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/private@example|secret\.pdf|résumé/)
  })
  it('has no mutable last-reason state and logging failure cannot escape', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    inlineDiagnostic('parse_started', '11111111-1111-4111-8111-111111111111')
    inlineDiagnostic('budget_rejected', '22222222-2222-4222-8222-222222222222')
    inlineDiagnostic('scored', '11111111-1111-4111-8111-111111111111')
    const records = info.mock.calls.map(call => JSON.parse(String(call[1])))
    expect(records[0].correlation).toBe(records[2].correlation)
    expect(records[1].correlation).not.toBe(records[0].correlation)
    info.mockImplementation(() => { throw new Error('synthetic logging failure') })
    expect(() => inlineDiagnostic('scored', '11111111-1111-4111-8111-111111111111')).not.toThrow()
  })
})
