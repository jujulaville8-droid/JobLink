import { employerBillingEnabled } from '@/lib/employer-billing/config'

/**
 * Before employer pricing, every listing from a Pro company was shown as
 * featured. With pricing on, featured comes only from the listing itself:
 * a live Spotlight window or an editorial feature, both reflected in
 * job_listings.is_featured. Server code only.
 */
export const proCompanyFeatured = (company: { is_pro?: boolean | null } | null | undefined): boolean =>
  !employerBillingEnabled() && company?.is_pro === true
