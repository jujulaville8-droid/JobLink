import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = await request.json();

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const currentRole = userData?.role;
  const isAdmin = currentRole === "admin" || user.user_metadata?.is_admin === true;

  // Only admins can switch to the admin role
  if (role === "admin") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  } else if (role !== "seeker" && role !== "employer") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Non-admin users cannot switch if they are currently admin (safety check)
  if (currentRole === "admin" && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Update role in users table
  const { error: updateError } = await supabase
    .from("users")
    .update({ role })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
  }

  // Update user metadata — persist is_admin flag so they can always switch back
  await supabase.auth.updateUser({
    data: {
      role,
      ...(isAdmin ? { is_admin: true } : {}),
    },
  });

  return NextResponse.json({ success: true, role });
}
