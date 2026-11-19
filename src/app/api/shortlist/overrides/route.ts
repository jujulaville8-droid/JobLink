import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/api-auth';
import { OVERRIDE_ACTIONS, type OverrideAction } from '@/lib/shortlist/ranking';

/**
 * Employer shortlist overrides: pin (Save for later), remove (Pass), interview.
 * POST adds an override, DELETE removes it. Body: { applicationId, action }.
 */

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
  return typeof error.message === 'string' && /shortlist_overrides/.test(error.message) && /does not exist|could not find/i.test(error.message);
}

async function parseBody(request: NextRequest): Promise<{ applicationId: string; action: OverrideAction } | null> {
  try {
    const body = (await request.json()) as { applicationId?: unknown; action?: unknown };
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId.trim() : '';
    const action = body.action as OverrideAction;
    if (!applicationId || applicationId.length > 64 || !OVERRIDE_ACTIONS.includes(action)) return null;
    return { applicationId, action };
  } catch {
    return null;
  }
}

async function handle(request: NextRequest, mode: 'add' | 'remove') {
  try {
    const auth = await requireVerifiedUser();
    if ('error' in auth) return auth.error;
    const { user, supabase } = auth;

    const body = await parseBody(request);
    if (!body) {
      return NextResponse.json({ error: 'applicationId and a valid action (pin, remove, interview) are required' }, { status: 400 });
    }

    // Ownership: application -> listing -> company owned by this user (same style as the status endpoint).
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, job_id')
      .eq('id', body.applicationId)
      .single();
    if (appError || !application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const { data: listing, error: listingError } = await supabase
      .from('job_listings')
      .select('id, company_id')
      .eq('id', application.job_id)
      .single();
    if (listingError || !listing) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', listing.company_id)
      .single();
    if (companyError || !company) {
      return NextResponse.json({ error: 'You are not authorized to update this application' }, { status: 403 });
    }

    try {
      const table = supabase.from('shortlist_overrides');
      const { error } =
        mode === 'add'
          ? await table.upsert(
              { application_id: body.applicationId, employer_id: user.id, action: body.action },
              { onConflict: 'application_id,action', ignoreDuplicates: true },
            )
          : await table
              .delete()
              .eq('application_id', body.applicationId)
              .eq('employer_id', user.id)
              .eq('action', body.action);
      if (error) {
        if (isMissingTable(error)) return NextResponse.json({ success: true, persisted: false });
        console.error('[shortlist-overrides] write failed:', error.code);
        return NextResponse.json({ error: 'Could not save this change' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ success: true, persisted: false });
    }

    return NextResponse.json({ success: true, persisted: true, action: body.action, mode });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request, 'add');
}

export async function DELETE(request: NextRequest) {
  return handle(request, 'remove');
}
