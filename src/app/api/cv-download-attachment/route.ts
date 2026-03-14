import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves CV/resume attachments from chat messages.
 * Verifies the user is authenticated and a participant in a conversation
 * that references this CV path.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a participant in a conversation that has a message with this attachment
  const { data: hasAccess } = await supabase
    .from("conversation_participants")
    .select("id, conversations!inner(id, messages!inner(id))")
    .eq("user_id", user.id)
    .eq("conversations.messages.attachment_url", path)
    .limit(1)
    .maybeSingle();

  if (!hasAccess) {
    // Fallback: also allow if user is an employer with an application from a seeker with this cv_url
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userData?.role !== "employer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if any seeker with this CV applied to one of this employer's jobs
    const { data: profile } = await supabase
      .from("seeker_profiles")
      .select("id")
      .eq("cv_url", path)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: hasApp } = await supabase
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

  // Generate signed URL
  const { data: signedUrlData, error: signError } = await supabase.storage
    .from("cvs")
    .createSignedUrl(path, 3600);

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
