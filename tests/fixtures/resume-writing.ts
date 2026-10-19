import { resumeWritingPayment as policy } from '@/lib/resume-writing-payment';
import type { ResumeWritingOrder, WritingTerms } from '@/lib/resume-writing';
import type { WritingPaymentPolicy } from '@/lib/resume-writing-stripe';
export const writingUser = '10000000-0000-4000-8000-000000000001';
export const writingOther = '10000000-0000-4000-8000-000000000002';
export const writingAdmin = '10000000-0000-4000-8000-000000000003';
export const writingId = '20000000-0000-4000-8000-000000000001';
export const writingTerms: WritingTerms = { version:'fixture-v1', delivery:'Fixture delivery terms; no production timing promise.',revision:'Fixture revision terms.',refund:'Fixture refund terms.',privacy:'Fixture privacy terms.' };
export const writingIntake = { name:'Synthetic Seeker',email:'synthetic@example.com',role:'Shop assistant',education:'',skills:'Organising school projects',experience:'',experienceType:'none' as const };
export const writingOrder: ResumeWritingOrder = { id:writingId,intake:writingIntake,intake_status:'draft',revision_note:null,terms:writingTerms,payment_status:'unpaid',checkout_status:'pending',fulfillment_status:'awaiting_payment',payment_review_required:false,revision_count:0,version:0,created_at:'2026-10-17T00:00:00Z' };
export function writingSession(reference = writingId, suffix='Example', p:WritingPaymentPolicy|typeof policy=policy) {
  return {
    id:`cs_${p.livemode?'live':'test'}_${suffix}`, mode:'payment',status:'complete',payment_status:'paid',livemode:p.livemode,
    client_reference_id:reference,payment_link:String(p.paymentLinkId),currency:'xcd',amount_total:5000,amount_subtotal:5000,
    total_details:{amount_discount:0,amount_shipping:0,amount_tax:0},
    line_items:{has_more:false,data:[{quantity:1,price:{id:String(p.priceId),product:String(p.productId),currency:'xcd',unit_amount:5000}}]},
    payment_intent:{id:`pi_${suffix}`,status:'succeeded',currency:'xcd',amount_received:5000,
      latest_charge:{id:`ch_${suffix}`,status:'succeeded',currency:'xcd',paid:true,captured:true,amount_captured:5000,amount_refunded:0,refunded:false,disputed:false}},
  };
}
