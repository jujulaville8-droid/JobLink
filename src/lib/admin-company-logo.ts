import sharp from 'sharp'

export const MAX_LOGO_BYTES = 5 * 1024 * 1024
export const COMPANY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORMATS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }

/** Decode and re-encode raster uploads so MIME spoofing and active content cannot reach storage. */
export async function normalizeAdminCompanyLogo(file: File): Promise<Buffer> {
  const format = FORMATS[file.type]
  if (!format || file.size === 0 || file.size > MAX_LOGO_BYTES) {
    throw new Error('Logo must be a PNG, JPEG, or WebP image under 5MB.')
  }
  const source = Buffer.from(await file.arrayBuffer())
  const image = sharp(source, { limitInputPixels: 16_000_000, failOn: 'warning' })
  const metadata = await image.metadata()
  if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) {
    throw new Error('Logo must contain a valid, still PNG, JPEG, or WebP image.')
  }
  return image.rotate().resize(256, 256, { fit: 'contain', background: '#ffffff' }).png().toBuffer()
}

/** Only URLs in this company's public logo folder can be saved by the admin URL form. */
export function isCompanyLogoStorageUrl(value: string, companyId: string, userId: string, storageBase: string): boolean {
  if (!value || value.length > 1000 || value.includes('%') || /\/\.{1,2}(?:\/|[?#]|$)/.test(value)
    || !COMPANY_ID_PATTERN.test(companyId) || !COMPANY_ID_PATTERN.test(userId)) return false
  try {
    const url = new URL(value)
    const base = new URL(storageBase)
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.search || url.hash) return false
    const prefix = '/storage/v1/object/public/company-logos/'
    if (!url.pathname.startsWith(prefix)) return false
    const path = url.pathname.slice(prefix.length)
    const folder = path.startsWith(`admin/${companyId}/`) ? `admin/${companyId}/` : `${userId}/`
    if (!path.startsWith(folder)) return false
    return /^[a-z0-9][a-z0-9._-]{0,175}\.(?:png|jpe?g|webp)$/i.test(path.slice(folder.length))
  } catch {
    return false
  }
}
