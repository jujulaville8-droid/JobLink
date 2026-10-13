import { z } from 'zod'

// Shared public validation only. Routing and provider configuration stay in the API.
export const supportSchema = z.object({
  id: z.uuid(),
  created_at: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]*$/),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  message: z.string().trim().min(10).max(5000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/),
  consent: z.literal(true),
  website: z.string().max(300).default(''),
})

// Stay inside Resend's 24-hour deduplication window, including uncertain retries.
export const SUPPORT_RETRY_WINDOW_MS = 23 * 3600000
