/**
 * Employer pricing: switches and the Stripe objects that identify each offer.
 *
 * Everything ships switched off:
 *   EMPLOYER_BILLING_ENABLED   Spotlight and Pro purchases, credits, campaigns,
 *                              and the new featured rule (paid window only)
 *   directory gate             a database switch, opened from the admin page
 *
 * The price and Payment Link IDs differ between Stripe sandbox and live; the
 * webhook refuses any event whose mode does not match EMPLOYER_BILLING_LIVEMODE.
 */

export const SPOTLIGHT_AMOUNT = 12500
export const PRO_AMOUNT = 20000
export const EMPLOYER_CURRENCY = 'xcd'
export const SPOTLIGHT_PRICE_LABEL = 'EC$125'
export const PRO_PRICE_LABEL = 'EC$200'
export const SPOTLIGHT_HOURS = 168

export type EmployerOffer = 'spotlight' | 'pro'

export interface OfferConfig { priceId: string; linkId: string | null; linkUrl: string }
export interface EmployerBillingConfig { livemode: boolean; spotlight: OfferConfig; pro: OfferConfig }

const envId = (name: string, prefix: string) => {
  const value = process.env[name]?.trim()
  return value && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value) ? value : null
}
const envUrl = (name: string) => {
  const value = process.env[name]?.trim()
  return value && /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\/[A-Za-z0-9_/-]+$/.test(value) ? value : null
}

export const employerBillingEnabled = (): boolean => process.env.EMPLOYER_BILLING_ENABLED === 'true'

/** Null unless every ID needed to sell and to recognise both offers is set. */
export function employerBillingConfig(): EmployerBillingConfig | null {
  const mode = process.env.EMPLOYER_BILLING_LIVEMODE
  if (mode !== 'true' && mode !== 'false') return null
  const spotlightPrice = envId('EMPLOYER_SPOTLIGHT_PRICE_ID', 'price')
  const proPrice = envId('EMPLOYER_PRO_PRICE_ID', 'price')
  const spotlightUrl = envUrl('EMPLOYER_SPOTLIGHT_LINK_URL')
  const proUrl = envUrl('EMPLOYER_PRO_LINK_URL')
  if (!spotlightPrice || !proPrice || !spotlightUrl || !proUrl || spotlightPrice === proPrice) return null
  return {
    livemode: mode === 'true',
    spotlight: { priceId: spotlightPrice, linkId: envId('EMPLOYER_SPOTLIGHT_LINK_ID', 'plink'), linkUrl: spotlightUrl },
    pro: { priceId: proPrice, linkId: envId('EMPLOYER_PRO_LINK_ID', 'plink'), linkUrl: proUrl },
  }
}

/** Sales are open only when switched on and fully configured. */
export const employerSalesOpen = (): boolean => employerBillingEnabled() && employerBillingConfig() !== null

/** Which offer a price or Payment Link belongs to, if either. */
export function offerFor(config: EmployerBillingConfig, ids: { priceIds?: string[]; linkId?: string | null }): EmployerOffer | null {
  const prices = ids.priceIds ?? []
  if (prices.includes(config.spotlight.priceId) || (ids.linkId && ids.linkId === config.spotlight.linkId)) return 'spotlight'
  if (prices.includes(config.pro.priceId) || (ids.linkId && ids.linkId === config.pro.linkId)) return 'pro'
  return null
}
