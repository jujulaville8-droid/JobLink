import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, requireVerifiedUser } from '@/lib/api-auth';
import { listingFields, postingErrors, postingSchema } from '@/lib/job-posting';
import { sendEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const { supabase, user } = auth;
  const { data: company, error } = await supabase.from('companies').select('id, company_name, industry, location').eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load your company.' }, { status: 500 });
  if (!company) return NextResponse.json({ setup: true });
  const id = request.nextUrl.searchParams.get('id');
  let query = supabase.from('job_listings').select('*').eq('company_id', company.id);
  if (id) {
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 });
    query = query.eq('id', id).in('status', ['draft', 'pending_approval', 'active']);
  } else query = query.eq('status', 'draft').order('updated_at', { ascending: false }).limit(1);
  const result = await query.maybeSingle();
  if (result.error || (id && !result.data)) return NextResponse.json({ error: 'Could not load your listing.' }, { status: 404 });
  return NextResponse.json({ company, listing: result.data });
}

const requestSchema = z.object({ id: z.uuid(), action: z.enum(['draft', 'submit', 'edit']), step: z.number().int().min(0).max(4), form: postingSchema });
export async function POST(request: NextRequest) {
  const auth = await requireVerifiedUser();
  if ('error' in auth) return auth.error;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the listing fields.' }, { status: 400 });
  const { id, action, step, form } = parsed.data;
  if (action !== 'draft' && Object.keys(postingErrors(form)).length) return NextResponse.json({ error: 'Complete the required fields.', errors: postingErrors(form) }, { status: 400 });
  const { supabase, user } = auth;
  const { data: company, error: companyError } = await supabase.from('companies').select('id, company_name, contact_email').eq('user_id', user.id).single();
  if (companyError || !company) return NextResponse.json({ error: 'Please complete your company profile.' }, { status: 403 });
  const { data: existing, error: lookupError } = await supabase.from('job_listings').select('id, status').eq('id', id).eq('company_id', company.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Could not load this listing.' }, { status: 500 });
  // Retried submissions return the committed state, without sending emails again.
  if (action === 'submit' && existing && ['pending_approval', 'active'].includes(existing.status)) return NextResponse.json({ listing: existing });
  if (action === 'edit' && (!existing || !['pending_approval', 'active'].includes(existing.status))) return NextResponse.json({ error: 'This listing cannot be edited.' }, { status: 409 });
  if (action !== 'edit' && existing && existing.status !== 'draft') return NextResponse.json({ error: 'This draft has already been submitted.' }, { status: 409 });
  const fields = action === 'draft'
    ? { ...listingFields(form), description: '', draft_data: { form, step } }
    : { ...listingFields(form), draft_data: { location_type: form.location_type } };
  const query = existing
    ? supabase.from('job_listings').update({ ...fields, ...(action === 'submit' ? { status: 'pending_approval' } : {}) }).eq('id', id).eq('company_id', company.id).eq('status', existing.status)
    : supabase.from('job_listings').insert({ ...fields, id, company_id: company.id, requires_work_permit: false, status: action === 'draft' ? 'draft' : 'pending_approval' });
  const { data: listing, error } = await query.select('id, status, title, location, job_type').maybeSingle();
  if (error || !listing) return NextResponse.json({ error: 'Could not save this listing. Reload if it changed in another tab.' }, { status: 409 });
  if (action === 'submit') {
    after(async () => {
      const data = { job_title: listing.title, company_name: company.company_name, status: listing.status };
      await Promise.allSettled([
        sendEmail({ to: company.contact_email || user.email!, type: 'listing_submitted', data, idempotencyKey: `listing-submitted/${id}/employer` }),
        sendEmail({ to: 'julianlaville@gmail.com', type: 'listing_submitted_admin', data, idempotencyKey: `listing-submitted/${id}/admin` }),
      ]);
    });
  }
  return NextResponse.json({ listing });
}
