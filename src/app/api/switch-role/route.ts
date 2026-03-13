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
    .select("role, is_admin")
    .eq("id", user.id)
    .single();

  // Only users with is_admin=true can switch to the admin role
  if (role === "admin") {
    if (!userData?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  } else if (role !== "seeker" && role !== "employer") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Update role in users table
  const { error: updateError } = await supabase
    .from("users")
    .update({ role })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
  }

  // Update user metadata to keep it in sync
  await supabase.auth.updateUser({
    data: { role },
  });

  return NextResponse.json({ success: true, role });
}
