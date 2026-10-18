import { z } from 'zod';

export const resumeIntakeSchema = z.object({
  name: z.string().trim().min(1).max(120), email: z.email().max(254), role: z.string().trim().min(1).max(150),
  education: z.string().trim().max(1500), skills: z.string().trim().max(1500), experience: z.string().trim().max(2000),
}).strict().refine(value=>new TextEncoder().encode(JSON.stringify(value)).length<=10000,'Please shorten your intake.');
export type ResumeWritingIntake = z.infer<typeof resumeIntakeSchema>;
export const createResumeOrderSchema = z.object({ id: z.uuid(), intake: resumeIntakeSchema, consent: z.literal(true), termsVersion: z.string().min(1).max(100) }).strict();
export const writingStatuses = ['awaiting_payment','ready','writing','draft_ready','revision_requested','complete'] as const;
export type WritingStatus = typeof writingStatuses[number];
export const writingStatusLabels: Record<WritingStatus,string> = {
  awaiting_payment: 'Awaiting payment', ready: 'Ready for preparation', writing: 'Writing', draft_ready: 'Draft ready',
  revision_requested: 'Revision requested', complete: 'Completed manually',
};
export type WritingTerms = { version: string; delivery: string; revision: string; refund: string; privacy: string };
export type WritingConfig = { intakeEnabled: boolean; checkoutEnabled: boolean; terms: WritingTerms | null; paymentMode?:'sandbox'|'live'|null };
export type ResumeWritingOrder = {
  id: string; intake: ResumeWritingIntake; terms: WritingTerms; payment_status: string; checkout_status: string;
  fulfillment_status: WritingStatus; payment_review_required: boolean; revision_count: number; version: number; created_at: string;
};
export const writingOrderFields = 'id,intake,terms,payment_status,checkout_status,fulfillment_status,payment_review_required,revision_count,version,created_at';
