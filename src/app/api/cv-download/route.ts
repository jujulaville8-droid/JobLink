import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profileId");

  if (!profileId) {
    return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify the requester is an authenticated employer
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the profile's cv_url
  const { data: profile } = await supabase
    .from("seeker_profiles")
    .select("cv_url")
    .eq("id", profileId)
    .in("visibility", ["actively_looking", "open"])
    .single();

  if (!profile?.cv_url) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  // Generate a signed URL for the CV file
  const { data: signedUrlData, error: signError } = await supabase.storage
    .from("cvs")
    .createSignedUrl(profile.cv_url, 3600);

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
