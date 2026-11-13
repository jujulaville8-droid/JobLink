// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import {
  VerificationDecryptError, VerificationKeyError, decryptDocument, encryptDocument, fileKeyReady, newConfirmationCode,
} from '@/lib/verification/crypto'
import { VerificationFileError, buildCleanPdf, cleanPhoto, newDocumentPath, sniffType } from '@/lib/verification/files'
import { buildRtwConfirmation, latin1Safe, stampLine, stampPoliceRecord } from '@/lib/verification/stamp'
import {
  CONFIRMATION_CODE_PATTERN, addMonths, badgeIsValid, badgeText, parseConfirmationCode, policeRecordIsRecent, verifiedUntil,
} from '@/lib/verification/shared'

const ID = '0b0f6a0e-1111-4222-8333-444455556666'
const OTHER_ID = '0b0f6a0e-9999-4222-8333-444455556666'
const key = () => randomBytes(32).toString('base64')
const saved = { ...process.env }

beforeEach(() => {
  process.env.VERIFICATION_FILE_KEY = key()
  process.env.VERIFICATION_FILE_KEY_VERSION = '1'
})
afterEach(() => { process.env = { ...saved } })

async function plainPdf(pages = 1) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([300, 400]).drawText(`Page ${i + 1}`)
  return Buffer.from(await pdf.save())
}
const photo = (width = 600, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: '#88aacc' } }).jpeg().toBuffer()

describe('JobLink\'s own encryption', () => {
  it('round-trips a document and stores nothing readable', () => {
    const plain = Buffer.from('%PDF-1.7 police record of Sam Seeker')
    const { blob, keyVersion } = encryptDocument(plain, ID, 'police_record')
    expect(keyVersion).toBe(1)
    expect(blob.includes(Buffer.from('Sam Seeker'))).toBe(false)
    expect(blob.subarray(0, 4).toString()).toBe('JLV1')
    expect(decryptDocument(blob, ID, 'police_record').equals(plain)).toBe(true)
  })

  it('uses a fresh nonce every time', () => {
    const plain = Buffer.from('same bytes')
    expect(encryptDocument(plain, ID, 'rtw').blob.equals(encryptDocument(plain, ID, 'rtw').blob)).toBe(false)
  })

  it('will not decrypt a file moved onto another person\'s record or another document slot', () => {
    const { blob } = encryptDocument(Buffer.from('secret'), ID, 'police_record')
    expect(() => decryptDocument(blob, OTHER_ID, 'police_record')).toThrow(VerificationDecryptError)
    expect(() => decryptDocument(blob, ID, 'rtw')).toThrow(VerificationDecryptError)
  })

  it('detects tampering and refuses anything that is not an encrypted document', () => {
    const { blob } = encryptDocument(Buffer.from('secret'), ID, 'rtw')
    blob[blob.length - 1] ^= 1
    expect(() => decryptDocument(blob, ID, 'rtw')).toThrow(VerificationDecryptError)
    expect(() => decryptDocument(Buffer.from('%PDF-1.7 plain file'.padEnd(64)), ID, 'rtw')).toThrow(VerificationDecryptError)
  })

  it('still reads files from before a key rotation', () => {
    const oldKey = process.env.VERIFICATION_FILE_KEY!
    const { blob } = encryptDocument(Buffer.from('old file'), ID, 'police_record')
    process.env.VERIFICATION_FILE_KEY = key()
    process.env.VERIFICATION_FILE_KEY_VERSION = '2'
    process.env.VERIFICATION_FILE_KEY_V1 = oldKey
    expect(decryptDocument(blob, ID, 'police_record').toString()).toBe('old file')
    expect(encryptDocument(Buffer.from('new'), ID, 'police_record').keyVersion).toBe(2)
    delete process.env.VERIFICATION_FILE_KEY_V1
    expect(() => decryptDocument(blob, ID, 'police_record')).toThrow(VerificationKeyError)
  })

  it.each([undefined, '', 'short', randomBytes(16).toString('base64'), 'not base64 !!!'])('refuses to run with a missing or weak key (%s)', (value) => {
    if (value === undefined) delete process.env.VERIFICATION_FILE_KEY
    else process.env.VERIFICATION_FILE_KEY = value
    expect(fileKeyReady()).toBe(false)
    expect(() => encryptDocument(Buffer.from('x'), ID, 'rtw')).toThrow(VerificationKeyError)
  })

  it('makes confirmation codes from the unambiguous alphabet', () => {
    const codes = new Set(Array.from({ length: 200 }, newConfirmationCode))
    expect(codes.size).toBe(200)
    for (const code of codes) expect(code).toMatch(CONFIRMATION_CODE_PATTERN)
  })
})

describe('upload checks', () => {
  it('reads the real type from the first bytes, not the name', async () => {
    expect(sniffType(await plainPdf())).toBe('pdf')
    expect(sniffType(await photo())).toBe('jpeg')
    expect(sniffType(await sharp(await photo()).png().toBuffer())).toBe('png')
    expect(sniffType(Buffer.from('MZ\x90\x00 this is a program'))).toBeNull()
    expect(sniffType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull()
  })

  it('refuses a file that is not a PDF, JPG or PNG whatever it is called', async () => {
    await expect(buildCleanPdf([Buffer.from('PK\x03\x04 a zip renamed police-record.pdf')])).rejects.toThrow(VerificationFileError)
  })

  it('refuses files over 3 MB, empty files and too many files', async () => {
    await expect(buildCleanPdf([Buffer.concat([await plainPdf(), Buffer.alloc(3 * 1024 * 1024)])])).rejects.toThrow('3 MB')
    await expect(buildCleanPdf([Buffer.alloc(0)])).rejects.toThrow(VerificationFileError)
    await expect(buildCleanPdf([])).rejects.toThrow(VerificationFileError)
    const one = await plainPdf()
    await expect(buildCleanPdf([one, one, one, one])).rejects.toThrow(VerificationFileError)
  })

  it('refuses a PDF that contains a script', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.addJavaScript('open', 'app.alert("hello")')
    await expect(buildCleanPdf([Buffer.from(await pdf.save())])).rejects.toThrow(/scripts or attachments/)
    // Also when the script sits inside a compressed object stream.
    await expect(buildCleanPdf([Buffer.from(await pdf.save({ useObjectStreams: true }))])).rejects.toThrow(/scripts or attachments/)
  })

  it('refuses a PDF that carries an attachment', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(Buffer.from('payload'), 'invoice.exe', { mimeType: 'application/octet-stream' })
    await expect(buildCleanPdf([Buffer.from(await pdf.save())])).rejects.toThrow(/scripts or attachments/)
  })

  it('refuses a password-protected or broken PDF with a plain message', async () => {
    await expect(buildCleanPdf([Buffer.from('%PDF-1.7\n1 0 obj << /Encrypt 5 0 R >> endobj\n%%EOF')])).rejects.toThrow(/password/)
    await expect(buildCleanPdf([Buffer.from('%PDF-1.7 this is not really a pdf')])).rejects.toThrow(VerificationFileError)
  })

  it('accepts an ordinary PDF and keeps its pages', async () => {
    const clean = await PDFDocument.load(await buildCleanPdf([await plainPdf(2)]))
    expect(clean.getPageCount()).toBe(2)
  })

  it('re-saves a photo upright with the camera\'s hidden data removed', async () => {
    const withLocation = await sharp(await photo())
      .withExif({ IFD0: { Make: 'PhoneCo', Model: 'Phone 12' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 7/1 0/1' } })
      .jpeg().toBuffer()
    expect((await sharp(withLocation).metadata()).exif).toBeTruthy()
    const { jpeg } = await cleanPhoto(withLocation)
    const meta = await sharp(jpeg).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.format).toBe('jpeg')
    expect(jpeg.includes(Buffer.from('PhoneCo'))).toBe(false)
  })

  it('shrinks oversized photos and refuses things that only pretend to be photos', async () => {
    const { width, height } = await cleanPhoto(await photo(4000, 3000))
    expect(Math.max(width, height)).toBe(2400)
    await expect(cleanPhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('garbage')]))).rejects.toThrow(VerificationFileError)
  })

  it('joins several photos and PDFs into one document', async () => {
    const clean = await PDFDocument.load(await buildCleanPdf([await photo(), await plainPdf(2), await photo(400, 800)]))
    expect(clean.getPageCount()).toBe(4)
  })

  it('stores under random names with no personal details in the path', () => {
    const path = newDocumentPath(ID, 'police_record')
    expect(path).toMatch(new RegExp(`^${ID}/police-[0-9a-f-]{36}\\.enc$`))
    expect(newDocumentPath(ID, 'police_record')).not.toBe(path)
    expect(newDocumentPath(ID, 'rtw')).toMatch(new RegExp(`^${ID}/rtw-[0-9a-f-]{36}\\.enc$`))
  })
})

describe('what an employer receives', () => {
  const details = { verifiedOn: '2026-11-14', sharedWith: 'Acme Security Ltd', sharedOn: '2026-11-20T15:00:00Z' }

  it('stamps the police record with who it was shared with and when', () => {
    expect(stampLine(details)).toBe('Verified by JobLink on 14 November 2026 · Shared with Acme Security Ltd on 20 November 2026')
    expect(stampLine({ ...details, sharedWith: null })).toContain('Preview for the job seeker')
  })

  it('adds the stamp in a band above each page without covering the record', async () => {
    const stamped = await PDFDocument.load(await stampPoliceRecord(await plainPdf(2), details))
    expect(stamped.getPageCount()).toBe(2)
    expect(stamped.getPage(0).getSize()).toEqual({ width: 300, height: 430 })
  })

  it('copes with company names the PDF font cannot draw', async () => {
    expect(latin1Safe('Café “Sunrise” ☃ 日本')).toBe('Café ?Sunrise? ? ??')
    await expect(stampPoliceRecord(await plainPdf(), { ...details, sharedWith: '日本語 🌴 Ltd' })).resolves.toBeInstanceOf(Buffer)
  })

  it('writes a one-page right-to-work confirmation', async () => {
    const pdf = await PDFDocument.load(await buildRtwConfirmation({
      ...details, name: 'Sam O’Seeker', group: 'work_permit', documentType: 'work_permit',
      verifiedUntil: '2027-03-01', confirmationCode: 'ABCDEFGH23',
    }))
    expect(pdf.getPageCount()).toBe(1)
  })
})

describe('badge rules', () => {
  it('lasts 6 months from the date on the police record', () => {
    expect(verifiedUntil('2026-11-10', null)).toBe('2027-05-10')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
  })

  it('ends sooner when a work permit expires first', () => {
    expect(verifiedUntil('2026-11-10', '2027-02-01')).toBe('2027-02-01')
    expect(verifiedUntil('2026-11-10', '2031-04-02')).toBe('2027-05-10')
  })

  it('accepts a police record up to 30 days old, and never one dated in the future', () => {
    expect(policeRecordIsRecent('2026-11-13', '2026-11-13')).toBe(true)
    expect(policeRecordIsRecent('2026-10-14', '2026-11-13')).toBe(true)
    expect(policeRecordIsRecent('2026-10-13', '2026-11-13')).toBe(false)
    expect(policeRecordIsRecent('2026-11-14', '2026-11-13')).toBe(false)
  })

  it('is valid through its last day and not after', () => {
    const badge = { status: 'approved', verified_until: '2027-05-10' }
    expect(badgeIsValid(badge, '2027-05-10')).toBe(true)
    expect(badgeIsValid(badge, '2027-05-11')).toBe(false)
    expect(badgeIsValid({ ...badge, status: 'withdrawn' }, '2027-01-01')).toBe(false)
    expect(badgeIsValid(null)).toBe(false)
  })

  it('uses the agreed wording and never implies a permit holder can start anywhere', () => {
    expect(badgeText({ holdsWorkPermit: false, checkedOn: '2026-11-14' })).toBe('Can work in Antigua without a permit · ID and police record checked · Nov 2026')
    expect(badgeText({ holdsWorkPermit: true, checkedOn: '2026-11-14' })).toBe('Holds an Antigua work permit · police record checked · Nov 2026')
    for (const word of ['safe', 'trusted', 'background']) {
      expect(badgeText({ holdsWorkPermit: false, checkedOn: '2026-11-14' }).toLowerCase()).not.toContain(word)
    }
  })

  it('reads confirmation codes however they are typed', () => {
    expect(parseConfirmationCode('abcde-fgh23')).toBe('ABCDEFGH23')
    expect(parseConfirmationCode(' ABCDE FGH23 ')).toBe('ABCDEFGH23')
    expect(parseConfirmationCode('ABCDEFGH01')).toBeNull()
    expect(parseConfirmationCode('../../etc')).toBeNull()
  })
})
