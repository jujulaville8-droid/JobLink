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

  if (role !== "seeker" && role !== "employer") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Don't allow admins to switch away from admin
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role === "admin") {
    return NextResponse.json({ error: "Admins cannot switch roles" }, { status: 403 });
  }

  // Update role in users table
  const { error: updateError } = await supabase
    .from("users")
    .update({ role })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
  }

  // Also update user metadata so it stays in sync
  await supabase.auth.updateUser({
    data: { role },
  });

  return NextResponse.json({ success: true, role });
}
