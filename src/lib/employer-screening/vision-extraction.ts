import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { APPROVED_SCREENING_ENDPOINT, APPROVED_SCREENING_MODEL, readBoundedResponse } from './provider'
import { extractResumeFromTranscribedPages, PDF_EXTRACTION_LIMITS, type PdfResumeExtraction } from './pdf-extraction'

export type VisionReadOutcome = { status: 'read'; extraction: PdfResumeExtraction } |
  { status: 'no_text' } | { status: 'unavailable' } | { status: 'disabled' }

const instruction = 'Transcribe every visible word of each résumé page image exactly as written, in reading order, one page per array entry. Preserve line breaks: each visual line of text is one line in the transcription. For two-column layouts, transcribe the left column fully before the right column. Headings stay on their own line. Do not summarize, interpret, correct spelling, add, or omit text. If a page has no readable text, its entry is an empty string. Return only the JSON object.'
const pagesSchema = z.object({ pages: z.array(z.string().max(PDF_EXTRACTION_LIMITS.pageCharacters)).min(1).max(3) }).strict()
const envelopeSchema = z.object({ model: z.literal(APPROVED_SCREENING_MODEL), status: z.literal('completed'),
  error: z.null(), incomplete_details: z.null(), output: z.array(z.union([
    z.object({ type: z.literal('message'), status: z.literal('completed'), role: z.literal('assistant'),
      content: z.array(z.object({ type: z.literal('output_text'), text: z.string().max(256_000) })).length(1) }),
    z.object({ type: z.literal('reasoning') }),
  ])).min(1).max(4) })

/** Images and transcriptions exist only for this invocation; only canonical projections escape storage boundaries. */
export async function readResumeWithVision(bytes: Uint8Array, options: {
  apiKey?: string; fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number
} = {}): Promise<VisionReadOutcome> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) return { status: 'disabled' }
  const head = Buffer.from(bytes.subarray(0, 12))
  const pdf = head.subarray(0, 5).toString('ascii') === '%PDF-'
  const image = (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
    (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) ||
    (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP')
  if ((!pdf && !image) || bytes.byteLength > PDF_EXTRACTION_LIMITS.bytes) return { status: 'unavailable' }
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timeout = options.timeoutMs ?? 45_000
  if (!Number.isFinite(timeout) || timeout <= 0) abort()
  const timer = setTimeout(abort, Math.min(45_000, Math.max(1, timeout)))
  const signal = controller.signal
  const live = () => { if (signal.aborted) throw new Error('Vision unavailable') }
  // Also bound stalled injected fetch/streams, not just implementations that honor signal.
  let rejectAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error('Vision unavailable'))
    signal.addEventListener('abort', rejectAbort, { once: true })
  })
  const work = async (): Promise<VisionReadOutcome> => {
    live()
    const { createCanvas, loadImage } = await import('@napi-rs/canvas')
    live()
    const images: string[] = []
    const encode = (canvas: import('@napi-rs/canvas').Canvas) => {
      live()
      images.push(`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 80).toString('base64')}`)
    }
    if (pdf) {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      live()
      class NoResources { async fetch(): Promise<never> { throw new Error('Vision unavailable') } }
      const documentOptions = { data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false,
        disableFontFace: true, useSystemFonts: false, useWasm: false, enableXfa: false,
        disableRange: true, disableStream: true, disableAutoFetch: true, stopAtErrors: true,
        useWorkerFetch: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
        maxImageSize: 6_000_000, BinaryDataFactory: NoResources }
      const task = getDocument(documentOptions)
      let destroyed: Promise<void> | undefined
      const destroy = () => { destroyed ??= task.destroy().catch(() => {}) }
      signal.addEventListener('abort', destroy, { once: true })
      try {
        const document = await task.promise
        live()
        if (document.isPureXfa || document.numPages < 1 || document.numPages > PDF_EXTRACTION_LIMITS.pages ||
            await document.getPermissions() !== null) throw new Error('Vision unavailable')
        for (let number = 1; number <= Math.min(3, document.numPages); number++) {
          live()
          const page = await document.getPage(number)
          try {
            const base = page.getViewport({ scale: 1 })
            const viewport = page.getViewport({ scale: Math.max(0.5, Math.min(2.5, 1400 / base.width)) })
            const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height)
            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
                width * height > 6_000_000) throw new Error('Vision unavailable')
            const canvas = createCanvas(width, height)
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
            const render = page.render({ canvas: canvas as unknown as HTMLCanvasElement,
              canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, background: '#ffffff' })
            const cancel = () => render.cancel()
            signal.addEventListener('abort', cancel, { once: true })
            try { live(); await render.promise; encode(canvas) }
            finally { signal.removeEventListener('abort', cancel) }
          } finally { page.cleanup() }
        }
      } finally {
        signal.removeEventListener('abort', destroy)
        destroy()
        await destroyed
      }
    } else {
      const decoded = await loadImage(Buffer.from(bytes))
      live()
      const scale = Math.min(1, 1600 / decoded.width)
      const width = Math.round(decoded.width * scale), height = Math.round(decoded.height * scale)
      if (width < 1 || height < 1 || width * height > 6_000_000) throw new Error('Vision unavailable')
      const canvas = createCanvas(width, height), ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
      ctx.drawImage(decoded, 0, 0, width, height)
      encode(canvas)
    }
    live()
    const response = await (options.fetch ?? fetch)(APPROVED_SCREENING_ENDPOINT, {
      method: 'POST', signal, redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: APPROVED_SCREENING_MODEL, store: false, stream: false, background: false,
        service_tier: 'default', tools: [], tool_choice: 'none', truncation: 'disabled',
        prompt_cache_options: { mode: 'explicit' }, reasoning: { effort: 'low' }, max_output_tokens: 4096,
        input: [{ role: 'user', content: [{ type: 'input_text', text: instruction },
          ...images.map(image_url => ({ type: 'input_image', image_url, detail: 'high' }))] }],
        text: { format: { type: 'json_schema', strict: true, name: 'resume_page_transcription',
          schema: { type: 'object', additionalProperties: false, required: ['pages'],
            properties: { pages: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } } } } },
      }),
    })
    const envelope = envelopeSchema.parse(await readBoundedResponse(response, 256_000, signal))
    live()
    const messages = envelope.output.filter(item => item.type === 'message')
    if (messages.length !== 1) throw new Error('Vision unavailable')
    const { pages } = pagesSchema.parse(JSON.parse(messages[0].content[0].text))
    if (pages.length !== images.length) throw new Error('Vision unavailable')
    if (pages.every(page => !page.trim())) return { status: 'no_text' }
    const extraction = extractResumeFromTranscribedPages(pages, createHash('sha256').update(bytes).digest('hex'))
    return extraction ? { status: 'read', extraction } : { status: 'unavailable' }
  }
  try { return await Promise.race([work(), cancelled]) }
  catch { return { status: 'unavailable' } }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    signal.removeEventListener('abort', rejectAbort)
  }
}
