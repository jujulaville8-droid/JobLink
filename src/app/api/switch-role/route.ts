import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData) {
      return NextResponse.json({ error: "User record not found" }, { status: 404 });
    }

    // Only users with a server-managed is_admin flag can switch to admin.
    if (role === "admin") {
      if (!userData.is_admin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // Privileged public.users fields are server-managed.
    const { error: updateError } = await admin
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
