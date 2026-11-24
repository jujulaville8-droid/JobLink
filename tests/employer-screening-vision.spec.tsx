// @vitest-environment node
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { readResumeWithVision } from '../src/lib/employer-screening/vision-extraction'
import { extractResumeFromTranscribedPages } from '../src/lib/employer-screening/pdf-extraction'
import { projectCv } from '../src/lib/seeker-cv/projection'
import { APPROVED_SCREENING_MODEL } from '../src/lib/employer-screening/provider'

const require = createRequire(import.meta.url)
async function blankPdf(pages = 1): Promise<Uint8Array> {
  const PDFDocument = require('pdfkit')
  const doc = new PDFDocument(), chunks: Buffer[] = []
  const result = new Promise<Uint8Array>(resolve => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
  for (let n = 0; n < pages; n++) { if (n) doc.addPage(); doc.rect(30, 30, 60, 60).fill('#aabbcc') }
  doc.end()
  return result
}
const png = () => createCanvas(32, 32).toBuffer('image/png')
const payload = (pages: string[]) => ({ model: APPROVED_SCREENING_MODEL, status: 'completed', error: null, incomplete_details: null,
  output: [{ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ pages }) }] }] })
const stub = (raw: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(raw)))

describe('bounded local vision extraction', () => {
  it('performs no fetch for disabled, unknown, oversized or aborted input', async () => {
    const fetch = vi.fn()
    expect(await readResumeWithVision(png(), { apiKey: '', fetch })).toEqual({ status: 'disabled' })
    expect(await readResumeWithVision(new Uint8Array([1]), { apiKey: 'test', fetch })).toEqual({ status: 'unavailable' })
    const oversized = new Uint8Array(6 * 1024 * 1024); oversized.set([0xff, 0xd8, 0xff])
    expect(await readResumeWithVision(oversized, { apiKey: 'test', fetch })).toEqual({ status: 'unavailable' })
    expect(await readResumeWithVision(png(), { apiKey: 'test', fetch, signal: AbortSignal.abort() })).toEqual({ status: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['png', 'pdf'])('renders %s and minimizes a valid transcription with source binding', async kind => {
    const bytes = kind === 'pdf' ? await blankPdf() : png()
    const fetch = stub(payload(['Skills\nExcel\nWork Experience\nRole: Cleaner\nCleaned guest rooms']))
    const result = await readResumeWithVision(bytes, { apiKey: 'test', fetch })
    expect(result.status).toBe('read')
    if (result.status !== 'read') return
    expect(result.extraction.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(result.extraction.evidence).toContainEqual(expect.objectContaining({ category: 'skill', excerpt: 'Excel' }))
    expect(projectCv(result.extraction).cv_skills).toContain('Microsoft Excel')
    expect(Object.isFrozen(result.extraction.localPages)).toBe(true)
    const request = JSON.parse(String(fetch.mock.calls[0][1]!.body))
    expect(request).toMatchObject({ model: APPROVED_SCREENING_MODEL, store: false, max_output_tokens: 4096, tools: [] })
    expect(request.input[0].content[1]).toMatchObject({ type: 'input_image', detail: 'high', image_url: expect.stringMatching(/^data:image\/jpeg;base64,/) })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('renders only the first three PDF pages', async () => {
    const fetch = stub(payload(['Skills\nExcel', '', '']))
    expect((await readResumeWithVision(await blankPdf(4), { apiKey: 'test', fetch })).status).toBe('read')
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body)).input[0].content).toHaveLength(4)
  })
  it.each([{}, payload([]), payload(['a', 'b']), payload(['x'.repeat(30_001)]),
    { ...payload(['Skills\nExcel']), model: 'other' },
    { ...payload(['Skills\nExcel']), output: [...payload(['a']).output, ...payload(['b']).output] },
  ])('rejects invalid envelopes and page counts', async raw => {
    expect(await readResumeWithVision(png(), { apiKey: 'test', fetch: stub(raw) })).toEqual({ status: 'unavailable' })
  })
  it('distinguishes blank transcription from provider failure', async () => {
    expect(await readResumeWithVision(png(), { apiKey: 'test', fetch: stub(payload([' \n'])) })).toEqual({ status: 'no_text' })
    expect(await readResumeWithVision(png(), { apiKey: 'test', fetch: vi.fn(async () => { throw new Error('private') }) })).toEqual({ status: 'unavailable' })
  })
  it('bounds a stalled fetch by the caller timeout', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}))
    expect(await readResumeWithVision(png(), { apiKey: 'test', fetch, timeoutMs: 50 })).toEqual({ status: 'unavailable' })
  })
  it('rejects transcription page and character limits', () => {
    const hash = 'a'.repeat(64)
    for (const pages of [[], Array(21).fill(''), ['a'.repeat(30_001)], Array(5).fill('a'.repeat(30_000))]) {
      expect(extractResumeFromTranscribedPages(pages, hash)).toBeNull()
    }
  })
})
