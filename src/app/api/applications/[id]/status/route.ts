import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, BASE_URL } from '@/lib/email';
import { sendStatusChangeMessage } from '@/lib/messaging-system-messages';

const VALID_STATUSES = ['applied', 'interview', 'rejected', 'hold'] as const;
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
    const { status, custom_message } = body as { status: string; custom_message?: string };

    if (!status || !VALID_STATUSES.includes(status as ValidStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: applied, interview, rejected, hold' },
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

    // Update the application status (use admin client to bypass RLS,
    // since we already verified ownership above)
    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient
      .from('applications')
      .update({ status })
      .eq('id', id);

    if (updateError) {
      console.error('[status-update] Supabase error:', JSON.stringify(updateError));
      return NextResponse.json(
        { error: 'Failed to update application status', detail: updateError.message, code: updateError.code },
        { status: 500 }
      );
    }

    // Skip notifications for reset to 'applied'
    if (status !== 'applied') {
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
          const companyInfo = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
          const statusLabels: Record<string, string> = {
            interview: 'Interview',
            rejected: 'Not Selected',
            hold: 'On Hold',
          };

          sendEmail({
            to: seekerUser.email,
            type: 'status_update',
            data: {
              job_title: listing.title,
              company_name: companyInfo?.company_name || 'the employer',
              status: statusLabels[status] || status,
              dashboard_url: `${BASE_URL}/applications`,
            },
          });
        }

        // Send system message into the conversation thread (fire-and-forget)
        const companyData = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
        sendStatusChangeMessage(supabase, {
          applicationId: id,
          employerUserId: user.id,
          seekerUserId: seekerProfile.user_id,
          newStatus: status,
          jobTitle: listing.title,
          companyName: companyData?.company_name || 'the employer',
          customMessage: custom_message,
        })
      }
    }

    return NextResponse.json({ success: true, status });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
