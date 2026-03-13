import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { role } = body;

    if (!role || typeof role !== "string") {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    // Validate role
    if (role !== "seeker" && role !== "employer" && role !== "admin") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Only users with is_admin=true can switch to the admin role
    if (role === "admin") {
      // Try DB first, fall back to auth metadata
      const { data: userData } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      const hasAdminAccess =
        userData?.is_admin === true ||
        user.user_metadata?.is_admin === true;

      if (!hasAdminAccess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // Update role in users table
    const { error: updateError } = await supabase
      .from("users")
      .update({ role })
      .eq("id", user.id);

    if (updateError) {
      console.error("[switch-role] Update error:", updateError);
      return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
    }

    // Update user metadata to keep it in sync
    await supabase.auth.updateUser({
      data: { role },
    });

    return NextResponse.json({ success: true, role });
  } catch (err) {
    console.error("[switch-role] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
