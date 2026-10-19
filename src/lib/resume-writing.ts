import { z } from 'zod';

export const resumeDraftSchema = z.object({
  name: z.string().trim().max(120), email: z.string().trim().max(254), role: z.string().trim().max(150),
  education: z.string().trim().max(1500), skills: z.string().trim().max(1500), experience: z.string().trim().max(2000),
  experienceType: z.enum(['', 'none', 'informal', 'paid', 'mixed']).default(''),
}).strict().refine(value=>new TextEncoder().encode(JSON.stringify(value)).length<=10000,'Please shorten your intake.');
export const resumeIntakeSchema = resumeDraftSchema.refine(value=>!!(value.name && z.email().safeParse(value.email).success && value.role && value.experienceType), 'Add your name, email, target job and experience choice.');
export type ResumeWritingIntake = z.infer<typeof resumeIntakeSchema>;
export const createResumeOrderSchema = z.object({ id: z.uuid(), intake: resumeDraftSchema, consent: z.literal(true), termsVersion: z.string().min(1).max(100) }).strict();
export const updateResumeOrderSchema = z.discriminatedUnion('action', [
  z.object({ action:z.literal('save'),version:z.number().int().nonnegative(),intake:resumeDraftSchema }).strict(),
  z.object({ action:z.literal('submit'),version:z.number().int().nonnegative(),intake:resumeIntakeSchema }).strict(),
  z.object({ action:z.literal('revision'),version:z.number().int().nonnegative(),requestId:z.uuid(),note:z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action:z.literal('approve'),version:z.number().int().nonnegative() }).strict(),
]);
export const writingStatuses = ['awaiting_payment','awaiting_intake','ready','writing','draft_ready','revision_requested','complete'] as const;
export type WritingStatus = typeof writingStatuses[number];
export const writingStatusLabels: Record<WritingStatus,string> = {
  awaiting_payment: 'Awaiting payment', awaiting_intake: 'Waiting for your questionnaire', ready: 'Ready for preparation', writing: 'Writing', draft_ready: 'Draft ready to download',
  revision_requested: 'Revision requested', complete: 'Completed',
};
export type WritingTerms = { version: string; delivery: string; revision: string; refund: string; privacy: string };
export type WritingConfig = { intakeEnabled: boolean; checkoutEnabled: boolean; terms: WritingTerms | null; paymentMode?:'sandbox'|'live'|null };
export type ResumeWritingOrder = {
  id: string; intake: ResumeWritingIntake; terms: WritingTerms; payment_status: string; checkout_status: string;
  fulfillment_status: WritingStatus; payment_review_required: boolean; revision_count: number; version: number; created_at: string;
  intake_status: 'draft'|'complete'; revision_note: string|null; files?: WritingFile[];
};
export type WritingFile = { id:string; kind:'pdf'|'editable'; revision_number:number; published_at:string|null };
export const writingFileFields = 'id,kind,revision_number,published_at';
export const writingOrderFields = 'id,intake,intake_status,terms,payment_status,checkout_status,fulfillment_status,payment_review_required,revision_count,revision_note,version,created_at';
export const writingConsultationUrl = 'https://calendly.com/qqwebsitesolutions/qq-solutions-consultation';
