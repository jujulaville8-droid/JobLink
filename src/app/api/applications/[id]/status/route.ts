import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, BASE_URL } from '@/lib/email';
import { sendStatusChangeMessage } from '@/lib/messaging-system-messages';

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

    // Get the application with seeker info
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, job_id, seeker_id')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Get the listing to verify ownership (include title + company for email)
    const { data: listing, error: listingError } = await supabase
      .from('job_listings')
      .select('company_id, title, companies(company_name)')
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

    // Notify the seeker about status change (fire-and-forget)
    const { data: seekerProfile } = await supabase
      .from('seeker_profiles')
      .select('user_id')
      .eq('id', application.seeker_id)
      .single();

    if (seekerProfile?.user_id) {
      const { data: seekerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', seekerProfile.user_id)
        .single();

      if (seekerUser?.email) {
        const company = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
        const statusLabels: Record<string, string> = {
          shortlisted: 'Shortlisted',
          rejected: 'Not Selected',
          hired: 'Hired',
        };

        sendEmail({
          to: seekerUser.email,
          type: 'status_update',
          data: {
            job_title: listing.title,
            company_name: company?.company_name || 'the employer',
            status: statusLabels[status] || status,
            dashboard_url: `${BASE_URL}/applications`,
          },
        });
      }
    }

    // Send system message into the conversation thread (fire-and-forget)
    if (seekerProfile?.user_id) {
      const companyData = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
      sendStatusChangeMessage(supabase, {
        applicationId: id,
        employerUserId: user.id,
        seekerUserId: seekerProfile.user_id,
        newStatus: status,
        jobTitle: listing.title,
        companyName: companyData?.company_name || 'the employer',
      })
    }

    return NextResponse.json({ application: updated });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
