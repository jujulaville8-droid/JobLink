/** Isolated rendering of a bounded copy of the existing resume document tree.
 * Only reviewed React-PDF primitives cross IPC. No runtime TS/TSX compilation,
 * remote assets, document scripts or applicant-controlled code is evaluated. */
import 'server-only'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { ReactElement } from 'react'
import type { CvFull } from '@/lib/types'

export const BUILDER_CAPTURE_LIMITS = Object.freeze({
  arrayItems: 50, totalItems: 150, objectKeys: 24, nodes: 4_000, depth: 5,
  stringCharacters: 4_000, totalCharacters: 64_000, serializedBytes: 128 * 1024,
  treeNodes: 1_500, treeDepth: 10, outputBytes: 5 * 1024 * 1024,
  renderBudgetMs: 3_000, concurrent: 2,
})
const collections = ['experiences', 'education', 'skills', 'awards', 'certifications', 'projects',
  'languages', 'volunteer', 'memberships', 'references'] as const
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

/** Check limits BEFORE cloning/stringifying/rendering. No truncation can alter the
 * applicant's declared CV: unsupported/oversized documents are simply unavailable. */
export function boundedBuilderSnapshot(input: unknown): CvFull {
  if (!plain(input) || !plain(input.profile) || !plain(input.contact) ||
      collections.some(key => !Array.isArray(input[key]))) throw new Error('Builder unavailable')
  let nodes = 0, items = 0, characters = 0
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > BUILDER_CAPTURE_LIMITS.nodes || depth > BUILDER_CAPTURE_LIMITS.depth) throw new Error('Builder limit')
    if (value === null || typeof value === 'boolean') return
    if (typeof value === 'string') {
      characters += value.length
      if (value.length > BUILDER_CAPTURE_LIMITS.stringCharacters || characters > BUILDER_CAPTURE_LIMITS.totalCharacters) throw new Error('Builder limit')
      return
    }
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (Array.isArray(value)) {
      items += value.length
      if (value.length > BUILDER_CAPTURE_LIMITS.arrayItems || items > BUILDER_CAPTURE_LIMITS.totalItems) throw new Error('Builder limit')
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (!plain(value)) throw new Error('Builder unavailable')
    let keys = 0
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      if (++keys > BUILDER_CAPTURE_LIMITS.objectKeys || key.length > 80) throw new Error('Builder limit')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) throw new Error('Builder unavailable')
      visit(descriptor.value, depth + 1)
    }
  }
  visit(input, 0)
  const skills = input.skills as Record<string, unknown>[]
  if (skills.some(skill => !plain(skill) || typeof skill.name !== 'string' || skill.name.length > 120)) throw new Error('Builder limit')
  const json = JSON.stringify(input)
  if (Buffer.byteLength(json, 'utf8') > BUILDER_CAPTURE_LIMITS.serializedBytes) throw new Error('Builder limit')
  return JSON.parse(json) as CvFull
}

type Tree = string | number | { type: string; props: Record<string, unknown>; children: Tree[] }
const types = new Set(['DOCUMENT', 'PAGE', 'TEXT', 'VIEW'])
const propNames = new Set(['title', 'author', 'size', 'style', 'minPresenceAhead', 'orphans', 'widows', 'fixed'])
function serializeDocument(element: ReactElement): Tree {
  let count = 0
  const visit = (value: unknown, depth: number): Tree[] => {
    if (++count > BUILDER_CAPTURE_LIMITS.treeNodes || depth > BUILDER_CAPTURE_LIMITS.treeDepth) throw new Error('Builder tree limit')
    if (value === null || value === undefined || typeof value === 'boolean') return []
    if (typeof value === 'string' || typeof value === 'number') return [value]
    if (Array.isArray(value)) return value.flatMap(child => visit(child, depth + 1))
    if (!plain(value) || !plain(value.props)) throw new Error('Builder tree unavailable')
    const type = value.type === Symbol.for('react.fragment') ? 'FRAGMENT' : value.type
    if (typeof type !== 'string' || (type !== 'FRAGMENT' && !types.has(type))) throw new Error('Builder primitive unavailable')
    const props: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(value.props)) {
      if (key === 'children') continue
      // The existing template's sole function is its fixed page-number footer.
      if (key === 'render' && type === 'TEXT' && value.props.fixed === true && typeof prop === 'function' && value.props.children === undefined) {
        props.pageNumber = true
      } else if (propNames.has(key) && typeof prop !== 'function' && typeof prop !== 'symbol') props[key] = prop
      else throw new Error('Builder property unavailable')
    }
    return [{ type, props, children: visit(value.props.children, depth + 1) }]
  }
  const roots = visit(element, 0)
  if (roots.length !== 1 || Buffer.byteLength(JSON.stringify(roots), 'utf8') > 256 * 1024) throw new Error('Builder tree limit')
  return roots[0]
}

const BUILDER_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const deny = () => { throw new Error('External builder resources disabled'); };
// Yoga ships its reviewed WASM as an inline data URL. Decode it locally without
// giving the renderer any network/file URL fetch capability.
globalThis.fetch = async resource => {
  const prefix = 'data:application/octet-stream;base64,';
  if (typeof resource !== 'string' || !resource.startsWith(prefix) || resource.length > 2 * 1024 * 1024) return deny();
  const bytes = Buffer.from(resource.slice(prefix.length), 'base64');
  if (bytes.subarray(0, 4).toString('hex') !== '0061736d') return deny();
  return new Response(bytes, { headers: { 'Content-Type': 'application/wasm' } });
};
globalThis.XMLHttpRequest = undefined;
globalThis.WebSocket = undefined;
(async () => {
  try {
    const React = await import(workerData.reactUrl);
    const pdf = await import(workerData.rendererUrl);
    const primitives = { DOCUMENT: pdf.Document, PAGE: pdf.Page, TEXT: pdf.Text, VIEW: pdf.View, FRAGMENT: React.Fragment };
    const hydrate = node => {
      if (typeof node === 'string' || typeof node === 'number') return node;
      const { pageNumber, ...props } = node.props;
      if (pageNumber === true) props.render = ({ pageNumber, totalPages }) => pageNumber + ' / ' + totalPages;
      return React.createElement(primitives[node.type], props, ...node.children.map(hydrate));
    };
    const stream = await pdf.renderToStream(hydrate(workerData.tree));
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > workerData.outputBytes) { stream.destroy(); throw new Error('Builder output limit'); }
      chunks.push(chunk);
    }
    const result = Uint8Array.from(Buffer.concat(chunks));
    parentPort.postMessage(result, [result.buffer]);
  } catch { parentPort.postMessage(null); }
})();
`
export type BuilderRenderOptions = { signal?: AbortSignal; budgetMs?: number }
let activeRenders = 0

/** CPU layout runs only in a disposable worker, so its deadline remains actionable
 * even if the renderer loops. Heap limits are not an OS/RSS/ArrayBuffer sandbox. */
export async function renderBuilderResume(input: CvFull, options: BuilderRenderOptions = {}): Promise<Uint8Array | null> {
  const budgetMs = options.budgetMs ?? BUILDER_CAPTURE_LIMITS.renderBudgetMs
  if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0 || budgetMs > BUILDER_CAPTURE_LIMITS.renderBudgetMs ||
      options.signal?.aborted || activeRenders >= BUILDER_CAPTURE_LIMITS.concurrent) return null
  const deadline = Date.now() + budgetMs
  activeRenders++
  try {
    const cv = boundedBuilderSnapshot(input)
    // This builds React elements only. Potentially expensive layout/rendering is
    // never called on the request thread. Keep this literal import trace-visible.
    const { createResumeDocument } = await import('@/lib/resume-pdf')
    if (options.signal?.aborted || Date.now() >= deadline) return null
    const tree = serializeDocument(createResumeDocument(cv))
    if (options.signal?.aborted || Date.now() >= deadline) return null
    const runtimeRequire = createRequire(join(process.cwd(), 'package.json'))
    const rendererUrl = pathToFileURL(runtimeRequire.resolve('@react-pdf/renderer')).href
    const reactUrl = pathToFileURL(runtimeRequire.resolve('react')).href
    const result = await new Promise<unknown>(resolve => {
      let worker: Worker | undefined, settled = false
      const finish = (value: unknown) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        if (worker) void worker.terminate().then(() => resolve(value), () => resolve(null))
        else resolve(value)
      }
      const abort = () => finish(null)
      const timer = setTimeout(abort, Math.max(1, deadline - Date.now()))
      options.signal?.addEventListener('abort', abort, { once: true })
      try {
        worker = new Worker(BUILDER_WORKER, {
          eval: true, env: {}, execArgv: [], stdout: true, stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
          workerData: { rendererUrl, reactUrl, tree, outputBytes: BUILDER_CAPTURE_LIMITS.outputBytes },
        })
        worker.stdout.resume(); worker.stderr.resume()
        worker.once('message', finish); worker.once('error', abort); worker.once('exit', abort)
        if (options.signal?.aborted || Date.now() >= deadline) abort()
      } catch { finish(null) }
    })
    if (options.signal?.aborted || Date.now() >= deadline || !(result instanceof Uint8Array) ||
        result.byteLength <= 5 || result.byteLength > BUILDER_CAPTURE_LIMITS.outputBytes ||
        Buffer.from(result.subarray(0, 5)).toString('ascii') !== '%PDF-') return null
    return result
  } catch { return null }
  finally { activeRenders-- }
}
