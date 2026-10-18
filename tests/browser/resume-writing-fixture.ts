import type { ResumeWritingOrder, WritingTerms } from '../../src/lib/resume-writing';
export const browserWritingTerms: WritingTerms = {
  version:'fixture-v1', delivery:'Synthetic fixture delivery terms. No production timing promise.',
  revision:'Synthetic fixture: one revision.', refund:'Synthetic fixture refund terms; pending business approval.',
  privacy:'Synthetic fixture privacy terms; pending retention and delivery decisions.',
};
export const browserWritingOrder: ResumeWritingOrder = {
  id:'20000000-0000-4000-8000-000000000001', intake:{ name:'Synthetic Seeker',email:'synthetic@example.com',role:'Shop assistant',education:'School leaver',skills:'Organising school projects',experience:'Community volunteering' },
  terms:browserWritingTerms,payment_status:'unpaid',checkout_status:'pending',fulfillment_status:'awaiting_payment',payment_review_required:false,revision_count:0,version:0,created_at:'2026-10-17T00:00:00Z',
};
