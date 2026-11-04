import { cvExtension } from '@/lib/cv-upload'
import { resumeFilename } from '@/lib/resume-filename';
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

/**
 * Serves CV/resume attachments from chat messages.
 * Verifies the user is authenticated and has a legitimate relationship
 * to the CV (either they own it or they're an employer who received it).
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  // Files live under `${ownerId}/`, so the first segment identifies the owner.
  // Dot segments, backslashes, tabs and newlines are rejected because URL parsing
  // would resolve them to a different folder when the path is signed.
  const ownerId = path.split("/")[0];
  if (
    !ownerId ||
    /[\\\t\r\n]/.test(path) ||
    path.split("/").some((segment) => /^(\.|%2e){1,2}$/i.test(segment))
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Use admin client for authorization lookups to bypass RLS
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  // Check 1: Does the file sit in the user's own folder?
  if (ownerId !== user.id) {
    // Check 2: Is the user an employer/admin who has an applicant with this CV?
    const { data: userData } = await adminClient
      .from("users")
      .select("role, is_admin")
      .eq("id", user.id)
      .single();

    // is_admin is the server-managed flag and survives a role switch; `role`
    // alone would drop admin access the moment an admin switched to seeker.
    const isAdmin = userData?.is_admin === true;

    if (!isAdmin && userData?.role !== "employer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isAdmin) {
      // Admins can access any CV — skip relationship check
    } else {
      // Verify this employer is a participant in a conversation where the
      // file's OWNER sent this attachment. Requiring sender = owner stops an
      // employer from forging the check by posting the victim's path as an
      // attachment in a thread of their own (RLS pins sender_id to the caller).
      const { data: hasMessage } = await adminClient
        .from("messages")
        .select("id, conversation:conversations!inner(id, conversation_participants!inner(user_id))")
        .eq("attachment_url", path)
        .eq("sender_id", ownerId)
        .eq("conversation.conversation_participants.user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!hasMessage) {
        // Fallback: check via seeker profile + application relationship
        const { data: company } = await adminClient
          .from("companies")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!company) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: profile } = await adminClient
          .from("seeker_profiles")
          .select("id")
          .eq("user_id", ownerId)
          .maybeSingle();

        if (!profile) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: hasApp } = await adminClient
          .from("applications")
          .select("id, job_listings!inner(company_id)")
          .eq("seeker_id", profile.id)
          .eq("job_listings.company_id", company.id)
          .limit(1)
          .maybeSingle();

        if (!hasApp) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }
  }

  // Resolve the name only after the existing attachment authorization succeeds.
  // Old chat attachments may no longer match a current profile: use Resume then.
  const { data: namedProfile } = await adminClient
    .from("seeker_profiles")
    .select("first_name, last_name")
    .eq("cv_url", path)
    .maybeSingle();
  const downloadName = resumeFilename(namedProfile?.first_name, namedProfile?.last_name, cvExtension(path) || 'pdf');

  // Generate signed download URL
  const { data: signedUrlData, error: signError } = await adminClient.storage
    .from("cvs")
    .createSignedUrl(path, 3600, { download: downloadName });

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
