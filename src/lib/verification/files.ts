import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptDocument, encryptDocument, sha256Hex } from './crypto'
import { VERIFICATION_FILE_LIMIT, VERIFICATION_FILES_PER_DOCUMENT, type VerificationDocument } from './shared'

export const verificationBucket = 'verification-private'
const MAX_PAGES = 10
const MAX_IMAGE_EDGE = 2400
const MAX_IMAGE_PIXELS = 50_000_000

/** A problem with the file itself, safe to show to the person who uploaded it. */
export class VerificationFileError extends Error {}

export type SniffedType = 'pdf' | 'jpeg' | 'png'

/** The real type, from the first bytes. The name and browser-reported type are ignored. */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  const head = Buffer.from(bytes.subarray(0, 12))
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  return null
}

// Names that make a PDF run something when opened, or carry another file.
// Initial-view settings (/OpenAction with a plain destination) are harmless and
// common, and are dropped anyway because only the pages are copied across.
const ACTIVE_PDF_NAMES = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'XFA', 'GoToE', 'ImportData', 'SubmitForm'])
// Only names long enough that they cannot turn up by chance in compressed data.
const RAW_SCAN = /\/(JavaScript|Launch|EmbeddedFiles?|RichMedia|ImportData|SubmitForm)(?![A-Za-z0-9])/

const pdfName = (name: PDFName) => name.decodeText()

function containsActiveContent(value: unknown, depth = 0): boolean {
  if (depth > 40) return true
  if (value instanceof PDFName) return ACTIVE_PDF_NAMES.has(pdfName(value))
  if (value instanceof PDFArray) return value.asArray().some((item) => containsActiveContent(item, depth + 1))
  const dict = value instanceof PDFDict ? value : value instanceof PDFStream ? value.dict : null
  if (!dict) return false
  return dict.entries().some(([key, item]) => ACTIVE_PDF_NAMES.has(pdfName(key)) || containsActiveContent(item, depth + 1))
}

/**
 * Refuse PDFs that contain scripts, launch actions, forms that submit, or
 * attachments. Checked twice: the raw bytes, and every parsed object (which
 * also sees inside compressed object streams the raw scan cannot).
 */
async function loadSafePdf(bytes: Buffer): Promise<PDFDocument> {
  const refused = new VerificationFileError('This PDF contains scripts or attachments, so we can\u2019t accept it. Save or print it as a plain PDF, or upload a photo instead.')
  const raw = bytes.toString('latin1')
  if (/\/Encrypt(?![A-Za-z0-9])/.test(raw)) {
    throw new VerificationFileError('This PDF is password protected. Upload a copy without a password, or a photo instead.')
  }
  if (RAW_SCAN.test(raw)) throw refused

  const unreadable = new VerificationFileError('We couldn\u2019t read this PDF. Try saving it again, or upload a photo instead.')
  let pdf: PDFDocument
  let pages: number
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    // A damaged file can load and only fail once its page tree is walked.
    pages = pdf.getPageCount()
    for (const page of pdf.getPages()) page.getSize()
  } catch {
    throw unreadable
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (containsActiveContent(object)) throw refused
  }
  if (pages < 1 || pages > MAX_PAGES) throw new VerificationFileError(`A PDF can have up to ${MAX_PAGES} pages.`)
  return pdf
}

/**
 * Re-save a photo: turned upright, shrunk to a readable size, and written out
 * fresh, which drops everything the camera hid in it (location, device, time).
 */
export async function cleanPhoto(bytes: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
    const { data, info } = await image.toBuffer({ resolveWithObject: true })
    return { jpeg: data, width: info.width, height: info.height }
  } catch {
    throw new VerificationFileError('We couldn’t read this photo. Take it again in good light and upload it as a JPG or PNG.')
  }
}

/**
 * Check and clean the files uploaded for one document and return a single
 * plain PDF: photos become pages, PDF pages are copied into a new file so
 * nothing but the pages themselves comes along.
 */
export async function buildCleanPdf(files: Buffer[]): Promise<Buffer> {
  if (files.length < 1) throw new VerificationFileError('Choose a file to upload.')
  if (files.length > VERIFICATION_FILES_PER_DOCUMENT) {
    throw new VerificationFileError(`Upload up to ${VERIFICATION_FILES_PER_DOCUMENT} files for each document.`)
  }
  const output = await PDFDocument.create()
  for (const bytes of files) {
    if (!bytes.length) throw new VerificationFileError('One of the files is empty. Choose it again.')
    if (bytes.length > VERIFICATION_FILE_LIMIT) throw new VerificationFileError('Each file can be up to 3 MB.')
    const type = sniffType(bytes)
    if (!type) throw new VerificationFileError('Upload a PDF, JPG or PNG.')
    if (type === 'pdf') {
      const source = await loadSafePdf(bytes)
      const pages = await output.copyPages(source, source.getPageIndices())
      for (const page of pages) {
        // Links and form widgets are not part of the document's content.
        page.node.delete(PDFName.of('Annots'))
        page.node.delete(PDFName.of('AA'))
        output.addPage(page)
      }
    } else {
      const { jpeg, width, height } = await cleanPhoto(bytes)
      const image = await output.embedJpg(jpeg)
      // A4-width page at the photo's own proportions.
      const pageWidth = 595
      const pageHeight = Math.max(100, Math.round((height / width) * pageWidth))
      output.addPage([pageWidth, pageHeight]).drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight })
    }
    if (output.getPageCount() > MAX_PAGES) throw new VerificationFileError(`A document can have up to ${MAX_PAGES} pages in total.`)
  }
  output.setTitle('')
  output.setProducer('JobLink')
  output.setCreator('JobLink')
  return Buffer.from(await output.save())
}

/** The server refuses to use the folder at all if it is ever switched to public. */
export async function privateVerificationStorage(db: SupabaseClient) {
  const result = await db.storage.getBucket(verificationBucket)
  if (result.error || !result.data || result.data.public !== false) throw new Error('Private storage unavailable.')
  return db.storage.from(verificationBucket)
}

const prefixes: Record<VerificationDocument, string> = { rtw: 'rtw', police_record: 'police' }

/** Random IDs only; no names in paths. */
export const newDocumentPath = (verificationId: string, kind: VerificationDocument) =>
  `${verificationId}/${prefixes[kind]}-${randomUUID()}.enc`

export interface StoredDocument { path: string; sha256: string; keyVersion: number }

/** Encrypt a cleaned PDF and store it. Returns where, its fingerprint and the key version. */
export async function storeDocument(db: SupabaseClient, verificationId: string, kind: VerificationDocument, cleanPdf: Buffer): Promise<StoredDocument> {
  const storage = await privateVerificationStorage(db)
  const { blob, keyVersion } = encryptDocument(cleanPdf, verificationId, kind)
  const path = newDocumentPath(verificationId, kind)
  const { error } = await storage.upload(path, blob, { contentType: 'application/octet-stream', upsert: false, cacheControl: '0' })
  if (error) throw new Error('Document could not be stored.')
  return { path, sha256: sha256Hex(cleanPdf), keyVersion }
}

/** Read and decrypt a stored document in memory. Verifies the fingerprint when one is known. */
export async function readDocument(db: SupabaseClient, verificationId: string, kind: VerificationDocument, path: string, sha256?: string | null): Promise<Buffer> {
  if (!path.startsWith(`${verificationId}/${prefixes[kind]}-`) || path.includes('..')) throw new Error('Document unavailable.')
  const storage = await privateVerificationStorage(db)
  const result = await storage.download(path)
  if (result.error || !result.data) throw new Error('Document unavailable.')
  const plain = decryptDocument(Buffer.from(await result.data.arrayBuffer()), verificationId, kind)
  if (sha256 && sha256Hex(plain) !== sha256) throw new Error('Document integrity check failed.')
  return plain
}

/** Delete stored files. Throws if any could not be removed, so callers never record a deletion that did not happen. */
export async function deleteDocuments(db: SupabaseClient, paths: (string | null | undefined)[]): Promise<void> {
  const targets = paths.filter((path): path is string => !!path)
  if (!targets.length) return
  const storage = await privateVerificationStorage(db)
  const { error } = await storage.remove(targets)
  if (error) throw new Error('Document could not be deleted.')
}

/** Headers for every response that carries a document. */
export const documentHeaders = (filename: string): HeadersInit => ({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `inline; filename="${filename}"`,
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, noarchive',
  'Referrer-Policy': 'no-referrer',
  // Framing is decided in next.config.ts: only the review screen may frame the
  // reviewer's file route. A document must never run or load anything.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
})
