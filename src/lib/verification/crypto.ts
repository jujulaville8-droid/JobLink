import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto'

/**
 * JobLink's own lock on each stored document, on top of the provider's
 * encryption at rest: AES-256-GCM with a key that lives only in the server
 * settings. Someone with access to the storage bucket alone reads noise.
 *
 * Envelope: "JLV1" | key version (uint16) | 12-byte nonce | 16-byte tag | ciphertext
 *
 * The verification id and document kind are bound in as associated data, so
 * an encrypted file moved onto another person's record will not decrypt.
 */

const MAGIC = Buffer.from('JLV1', 'ascii')
const HEADER = MAGIC.length + 2 + 12 + 16

export class VerificationKeyError extends Error {}
export class VerificationDecryptError extends Error {}

function decodeKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new VerificationKeyError(`${name} is not set`)
  const key = Buffer.from(value.trim(), 'base64')
  // Exactly 32 bytes, and the text must be canonical base64 of them.
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.trim().replace(/=+$/, '')) {
    throw new VerificationKeyError(`${name} must be 32 random bytes, base64 encoded`)
  }
  return key
}

/** The version new files are encrypted with. */
export function currentKeyVersion(): number {
  const raw = process.env.VERIFICATION_FILE_KEY_VERSION?.trim() || '1'
  const version = Number(raw)
  if (!/^\d{1,4}$/.test(raw) || version < 1) throw new VerificationKeyError('VERIFICATION_FILE_KEY_VERSION must be a whole number from 1')
  return version
}

/**
 * VERIFICATION_FILE_KEY holds the current version. After a rotation the old
 * key stays readable as VERIFICATION_FILE_KEY_V<old version> until every file
 * encrypted with it has expired.
 */
function keyFor(version: number): Buffer {
  if (version === currentKeyVersion()) return decodeKey(process.env.VERIFICATION_FILE_KEY, 'VERIFICATION_FILE_KEY')
  return decodeKey(process.env[`VERIFICATION_FILE_KEY_V${version}`], `VERIFICATION_FILE_KEY_V${version}`)
}

/** True when uploads could be encrypted right now. Never throws. */
export function fileKeyReady(): boolean {
  try { keyFor(currentKeyVersion()); return true } catch { return false }
}

const associatedData = (verificationId: string, kind: string) => Buffer.from(`${verificationId}/${kind}`, 'utf8')

export function encryptDocument(plain: Buffer, verificationId: string, kind: 'rtw' | 'police_record'): { blob: Buffer; keyVersion: number } {
  const keyVersion = currentKeyVersion()
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(keyVersion), nonce)
  cipher.setAAD(associatedData(verificationId, kind))
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const version = Buffer.alloc(2)
  version.writeUInt16BE(keyVersion)
  return { blob: Buffer.concat([MAGIC, version, nonce, cipher.getAuthTag(), body]), keyVersion }
}

export function decryptDocument(blob: Buffer, verificationId: string, kind: 'rtw' | 'police_record'): Buffer {
  if (blob.length <= HEADER || !blob.subarray(0, 4).equals(MAGIC)) throw new VerificationDecryptError('Not a JobLink encrypted document')
  const keyVersion = blob.readUInt16BE(4)
  const decipher = createDecipheriv('aes-256-gcm', keyFor(keyVersion), blob.subarray(6, 18))
  decipher.setAAD(associatedData(verificationId, kind))
  decipher.setAuthTag(blob.subarray(18, 34))
  try {
    return Buffer.concat([decipher.update(blob.subarray(HEADER)), decipher.final()])
  } catch {
    throw new VerificationDecryptError('Document could not be decrypted')
  }
}

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

// No 0/O or 1/I, so a code read out over the phone survives.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** 10 characters from a 32-letter alphabet: 50 bits, not guessable by walking. */
export function newConfirmationCode(): string {
  return Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}
