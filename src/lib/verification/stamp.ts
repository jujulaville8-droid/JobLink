import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { BASE_URL } from '@/lib/email'
import {
  RTW_DOCUMENT_TYPES, RTW_GROUPS, formatConfirmationCode, longDate, rtwStatusText,
  type RtwDocumentType, type RtwGroup,
} from './shared'

const TEAL = rgb(0.05, 0.45, 0.47)
const INK = rgb(0.1, 0.12, 0.15)
const MUTED = rgb(0.4, 0.43, 0.47)
const BAND = 30

/** The built-in PDF fonts cover Latin-1 only; anything else would throw. */
export function latin1Safe(text: string, max = 120): string {
  const cleaned = Array.from(text.normalize('NFC'))
    .map((char) => {
      const code = char.codePointAt(0)!
      if (code >= 0x20 && code <= 0x7e) return char
      if (code >= 0xa0 && code <= 0xff) return char
      if (char === '’' || char === '‘') return "'"
      if (char === '–' || char === '—') return '-'
      return /\s/.test(char) ? ' ' : '?'
    })
    .join('').replace(/\s+/g, ' ').trim()
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned
}

function fit(text: string, font: PDFFont, maxWidth: number, start: number, min = 6): number {
  let size = start
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5
  return size
}

export interface StampDetails {
  /** ISO date or timestamp the documents were checked. */
  verifiedOn: string
  /** Who this copy is for: a company name, or null for the job seeker's own preview. */
  sharedWith: string | null
  /** ISO timestamp of the share (or of the preview). */
  sharedOn: string
}

export const stampLine = (details: StampDetails): string =>
  details.sharedWith
    ? `Verified by JobLink on ${longDate(details.verifiedOn)} · Shared with ${latin1Safe(details.sharedWith, 60)} on ${longDate(details.sharedOn)}`
    : `Verified by JobLink on ${longDate(details.verifiedOn)} · Preview for the job seeker · ${longDate(details.sharedOn)}`

/**
 * Put the stamp on every page of a police record.
 *
 * Each page is rebuilt slightly taller with the original placed underneath a
 * band, so the stamp never covers anything on the record itself.
 */
export async function stampPoliceRecord(cleanPdf: Buffer, details: StampDetails): Promise<Buffer> {
  const source = await PDFDocument.load(cleanPdf, { updateMetadata: false })
  const output = await PDFDocument.create()
  const font = await output.embedFont(StandardFonts.HelveticaBold)
  const line = stampLine(details)
  const embedded = await output.embedPages(source.getPages())
  embedded.forEach((original) => {
    const { width, height } = original
    const page = output.addPage([width, height + BAND])
    page.drawPage(original, { x: 0, y: 0, width, height })
    page.drawRectangle({ x: 0, y: height, width, height: BAND, color: rgb(0.93, 0.97, 0.97) })
    page.drawRectangle({ x: 0, y: height, width, height: 1, color: TEAL })
    const size = fit(line, font, width - 24, 9.5)
    page.drawText(line, { x: 12, y: height + (BAND - size) / 2 + 1, size, font, color: TEAL })
  })
  output.setTitle('Police record, verified by JobLink')
  output.setProducer('JobLink')
  output.setCreator('JobLink')
  return Buffer.from(await output.save())
}

export interface RtwConfirmationDetails extends StampDetails {
  name: string
  group: RtwGroup
  documentType: RtwDocumentType
  verifiedUntil: string
  confirmationCode: string
}

/**
 * The right-to-work confirmation: one page written by JobLink. It states the
 * result of the check and never shows an ID number, a photo or the document.
 */
export async function buildRtwConfirmation(details: RtwConfirmationDetails): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const left = 56
  const width = 595 - left * 2
  let y = 842 - 64

  page.drawRectangle({ x: 0, y: 842 - 12, width: 595, height: 12, color: TEAL })
  page.drawText('JobLink', { x: left, y, size: 22, font: bold, color: TEAL })
  y -= 34
  page.drawText('Right-to-work confirmation', { x: left, y, size: 18, font: bold, color: INK })
  y -= 18
  const line = stampLine(details)
  page.drawText(line, { x: left, y, size: fit(line, regular, width, 9.5), font: regular, color: MUTED })
  y -= 36

  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: left, y, size: 8, font: bold, color: MUTED })
    y -= 16
    const safe = latin1Safe(value, 200)
    // Wrap long values (the permit wording) across lines.
    const words = safe.split(' ')
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (regular.widthOfTextAtSize(next, 13) > width && current) {
        page.drawText(current, { x: left, y, size: 13, font: regular, color: INK })
        y -= 17
        current = word
      } else current = next
    }
    page.drawText(current, { x: left, y, size: 13, font: regular, color: INK })
    y -= 28
  }

  row('Name', details.name)
  row('Right to work', rtwStatusText(details.group))
  row('Basis', RTW_GROUPS[details.group].label)
  row('Document checked', RTW_DOCUMENT_TYPES[details.documentType])
  row('Checked on', longDate(details.verifiedOn))
  row('Valid until', longDate(details.verifiedUntil))
  row('Verification code', formatConfirmationCode(details.confirmationCode))

  page.drawRectangle({ x: left, y: y - 46, width, height: 58, color: rgb(0.96, 0.97, 0.98) })
  page.drawText('Check this confirmation is genuine:', { x: left + 12, y: y - 8, size: 10, font: bold, color: INK })
  page.drawText(`${BASE_URL}/verified/check/${details.confirmationCode}`, { x: left + 12, y: y - 26, size: 10, font: regular, color: TEAL })
  y -= 82

  const notes = [
    'JobLink checked the document named above on the date shown. This page does not show ID numbers or photos.',
    'It confirms documents were checked on a date. It is not a reference, a background check or a guarantee.',
    details.group === 'work_permit'
      ? 'A work permit is tied to one employer and position. A new employer would need to apply for a permit.'
      : '',
  ].filter(Boolean)
  for (const note of notes) {
    page.drawText(note, { x: left, y, size: fit(note, regular, width, 9, 7), font: regular, color: MUTED })
    y -= 14
  }

  pdf.setTitle('Right-to-work confirmation, JobLink')
  pdf.setProducer('JobLink')
  pdf.setCreator('JobLink')
  return Buffer.from(await pdf.save())
}
