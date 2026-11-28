/**
 * The Verified preview gallery (/preview/verified) shows every screen with
 * made-up data and no database. It exists only when VERIFIED_PREVIEW=true and
 * never on the production deployment.
 */
export const verifiedPreviewEnabled = (): boolean =>
  process.env.VERIFIED_PREVIEW === 'true' && process.env.VERCEL_ENV !== 'production'
