import type { ResumeWritingOrder, WritingTerms } from '@/lib/resume-writing';

export const approvedWritingTerms = {
  version: '2026-10-19-v1',
  delivery: 'A person prepares and reviews your résumé in PDF and editable DOCX. Your first draft is due within 24 hours of payment and a completed questionnaire, including weekends. The clock starts once both are complete.',
  revision: 'One revision is included. Request it within 7 days of delivery.',
  refund: 'Full refund before writing starts, or if we cannot deliver. No refunds after delivery except where legally required. Your included revision remains available within its 7-day request window.',
  privacy: 'Customer files are kept for 90 days after completion. Files stay private and are accessible only to you and authorized JobLink staff.',
} satisfies WritingTerms;

export function writingRevisionDeadline(order: Pick<ResumeWritingOrder, 'terms'|'revision_expires_at'|'revision_count'>): number | null {
  if (order.terms.version !== approvedWritingTerms.version || order.revision_count !== 0) return null;
  const deadline = Date.parse(order.revision_expires_at??'');
  return Number.isFinite(deadline) ? deadline : null;
}

export function writingRevisionAvailable(order: Pick<ResumeWritingOrder, 'terms'|'revision_expires_at'|'revision_count'>, now = Date.now()): boolean {
  if (order.revision_count !== 0) return false;
  if (order.terms.version !== approvedWritingTerms.version) return true;
  const deadline = writingRevisionDeadline(order);
  return deadline !== null && now <= deadline;
}
