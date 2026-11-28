import { documentHeaders } from '@/lib/verification/files'
import { verifiedPreviewEnabled } from '@/lib/verification/preview'
import { buildRtwConfirmation } from '@/lib/verification/stamp'
import { addMonths, antiguaToday } from '@/lib/verification/shared'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/** Sample documents for the preview gallery, made with the real code. Clearly marked as samples. */
export async function GET(request: Request) {
  if (!verifiedPreviewEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const query = new URL(request.url).searchParams
  const today = antiguaToday()
  let pdf: Buffer
  if (query.get('document') === 'raw_rtw') {
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('SAMPLE', { x: 150, y: 330, size: 110, font: bold, color: rgb(0.93, 0.93, 0.93) })
    page.drawText('PASSPORT (sample ID image)', { x: 60, y: 760, size: 18, font: bold })
    for (const [index, line] of ['Antigua and Barbuda', '', 'Surname: SEEKER', 'Given names: SAM', 'Date of expiry: 02 APR 2031'].entries()) {
      page.drawText(line, { x: 60, y: 715 - index * 24, size: 12, font: regular })
    }
    pdf = Buffer.from(await doc.save())
  } else {
    const permit = query.has('permit')
    pdf = await buildRtwConfirmation({
      verifiedOn: today, sharedWith: query.get('for') === 'owner' ? null : 'Acme Security Ltd', sharedOn: new Date().toISOString(),
      name: 'Sam Seeker', group: permit ? 'work_permit' : 'citizen', documentType: permit ? 'work_permit' : 'passport',
      verifiedUntil: permit ? addMonths(today, 8) : addMonths(today, 24), confirmationCode: 'ABCDEFGH23',
    })
  }
  return new Response(new Uint8Array(pdf), { headers: documentHeaders('sample.pdf') })
}
