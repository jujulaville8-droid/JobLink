import { z } from 'zod'

export const PILOT_PATH = '/employers/hiring-help'
export const PILOT_URL = `https://joblinkantigua.com${PILOT_PATH}`
export const enquirySchema = z.object({
  id: z.uuid(),
  company_name: z.string().trim().min(2).max(150),
  contact_name: z.string().trim().min(2).max(100),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(40).default(''),
  job_title: z.string().trim().min(2).max(150),
  details: z.string().trim().min(20).max(6000),
  source: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('website'),
  contact_consent: z.literal(true),
  website: z.string().max(300).default(''), // honeypot, never persisted
})

export const enquiryStatuses = ['new', 'contacted', 'preparing', 'live', 'closed'] as const
export const statusLabels: Record<typeof enquiryStatuses[number], string> = {
  new: 'New request', contacted: 'Contacted', preparing: 'Preparing vacancy', live: 'Listing live', closed: 'Closed',
}

export function pilotEmailCta() {
  return `<p style="margin:24px 0"><a href="${PILOT_URL}?source=agent-outreach" style="display:inline-block;padding:14px 24px;background:#0d7377;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Send us your vacancy</a></p><p>Try our free first-vacancy pilot. No account needed to request help. We’ll confirm the details with you before publishing.</p>`
}
