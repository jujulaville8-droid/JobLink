import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['shortlisted', 'rejected', 'hired'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse body
    const body = await request.json();
    const { status } = body as { status: string };

    if (!status || !VALID_STATUSES.includes(status as ValidStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: shortlisted, rejected, hired' },
        { status: 400 }
      );
    }

    // Get the application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, job_id')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Get the listing to verify ownership
    const { data: listing, error: listingError } = await supabase
      .from('job_listings')
      .select('company_id')
      .eq('id', application.job_id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: 'Job listing not found' },
        { status: 404 }
      );
    }

    // Verify the user owns the company that posted this listing
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', listing.company_id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'You are not authorized to update this application' },
        { status: 403 }
      );
    }

    // Update the application status
    const { data: updated, error: updateError } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update application status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ application: updated });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
