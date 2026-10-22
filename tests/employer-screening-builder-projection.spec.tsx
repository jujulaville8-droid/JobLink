// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderBuilderResume } from '../src/lib/employer-screening/builder-render'
import { extractPdfResume } from '../src/lib/employer-screening/pdf-extraction'
import { projectProfessionalResume, validateProfessionalProjectionData } from '../src/lib/employer-screening/professional-projection'
import { builderScreeningFixture } from './fixtures/builder-screening'

describe('production builder PDF to professional projection, offline', () => {
  it.each([false, true])('preserves builder content and source spans, including continuation pages: %s', async multipage => {
    const cv = builderScreeningFixture()
    if (multipage) cv.experiences[1].description += '\n' + Array.from({ length: 24 }, (_, i) =>
      `Recorded dispatch batch ${i + 1}, checked stock quantities against the order sheet and documented delivery follow-up for the next shift.`).join('\n')
    const bytes = await renderBuilderResume(cv)
    expect(bytes).not.toBeNull()
    const parsed = await extractPdfResume(bytes!)
    expect(parsed).not.toBeNull()
    const result = projectProfessionalResume({ sourceSha256: parsed!.sourceSha256, pages: parsed!.localPages })!
    expect(result.providerInput.coverage).toBe('full')
    expect(result.providerInput.overallQualityScoreAllowed).toBe(true)
    expect([...new Set(result.providerInput.records.map(record => record.section))]).toEqual(['summary', 'work', 'qualifications', 'skills'])
    if (multipage) {
      expect(parsed!.localPages.length).toBeGreaterThan(1)
      expect(result.providerInput.records.filter(record => record.section === 'work').length).toBeGreaterThan(1)
    }
    const transmitted = JSON.stringify(result.providerInput)
    for (const phrase of ['Customer-service professional', 'Aurora Supply', 'Harbour Stores', 'not needed', 'Completed coursework', 'Microsoft Excel']) {
      expect(transmitted).toContain(phrase)
    }
    expect(transmitted).not.toMatch(/Jordan|Ellis|jordan\.ellis@|555-0148/)
    for (const record of result.providerInput.records) {
      const span = result.localSources.find(source => source.id === record.id)!.spans[0]
      expect(record.text).toBe(parsed!.localPages[span.page - 1].slice(span.start, span.end))
    }
    expect(validateProfessionalProjectionData(result.providerInput)).toEqual(result.providerInput)
  }, 15_000)
})
