import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { documentHeaders } from '@/lib/verification/files'
import { verifiedPreviewEnabled } from '@/lib/verification/preview'
import { buildRtwConfirmation, stampPoliceRecord } from '@/lib/verification/stamp'
import { addMonths, antiguaToday } from '@/lib/verification/shared'

/** A made-up document for the preview gallery. Clearly marked as a sample. */
async function samplePage(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('SAMPLE', { x: 150, y: 330, size: 110, font: bold, color: rgb(0.93, 0.93, 0.93), rotate: { type: 'degrees', angle: 35 } as never })
  page.drawText(title, { x: 60, y: 760, size: 18, font: bold })
  lines.forEach((line, index) => page.drawText(line, { x: 60, y: 715 - index * 24, size: 12, font: regular }))
  page.drawText('Sample for the JobLink preview. Not a real document.', { x: 60, y: 60, size: 10, font: regular, color: rgb(0.5, 0.5, 0.5) })
  return Buffer.from(await pdf.save())
}

/** Sample documents made with the real stamping code. Preview only. */
export async function GET(request: Request) {
  if (!verifiedPreviewEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const query = new URL(request.url).searchParams
  const today = antiguaToday()
  const stamp = { verifiedOn: today, sharedWith: query.get('for') === 'owner' ? null : 'Acme Security Ltd', sharedOn: new Date().toISOString() }
  const record = () => samplePage('ROYAL POLICE FORCE OF ANTIGUA AND BARBUDA', [
    'Criminal Records Office', '', 'POLICE CERTIFICATE OF CHARACTER', '', 'Name: Sam Seeker', `Date of issue: ${today}`, '', '(The contents of a real record would appear here.)',
  ])
  let pdf: Buffer
  switch (query.get('document')) {
    case 'rtw':
      pdf = await buildRtwConfirmation({ ...stamp, name: 'Sam Seeker', group: query.get('permit') ? 'work_permit' : 'citizen', documentType: query.get('permit') ? 'work_permit' : 'passport', verifiedUntil: addMonths(today, 6), confirmationCode: 'ABCDEFGH23' })
      break
    case 'raw_rtw':
      pdf = await samplePage('PASSPORT (sample ID image)', ['Antigua and Barbuda', '', 'Surname: SEEKER', 'Given names: SAM', 'Date of expiry: 02 APR 2031', '', '(A real upload would be a photo of the document.)'])
      break
    case 'raw_police_record':
      pdf = await record()
      break
    default:
      pdf = await stampPoliceRecord(await record(), stamp)
  }
  return new Response(new Uint8Array(pdf), { headers: documentHeaders('sample.pdf') })
}
