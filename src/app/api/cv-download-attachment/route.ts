import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client for authorization lookups to bypass RLS
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  // Check 1: Is the user the owner of this CV?
  const { data: ownProfile } = await adminClient
    .from("seeker_profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("cv_url", path)
    .maybeSingle();

  if (!ownProfile) {
    // Check 2: Is the user an employer/admin who has an applicant with this CV?
    const { data: userData } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userData?.role !== "employer" && userData?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (userData?.role === "admin") {
      // Admins can access any CV — skip relationship check
    } else {
      const { data: company } = await adminClient
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!company) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Find the seeker with this CV
      const { data: profile } = await adminClient
        .from("seeker_profiles")
        .select("id")
        .eq("cv_url", path)
        .maybeSingle();

      if (!profile) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Verify this seeker applied to one of the employer's jobs
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

  // Generate signed download URL
  const { data: signedUrlData, error: signError } = await adminClient.storage
    .from("cvs")
    .createSignedUrl(path, 3600, { download: true });

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
