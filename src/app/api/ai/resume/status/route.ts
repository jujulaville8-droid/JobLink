import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ purchased: false, preview: null });
    }

    const admin = createAdminClient();

    const [{ data: purchase }, { data: preview }] = await Promise.all([
      admin
        .from("ai_purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("feature", "smart_resume")
        .maybeSingle(),
      admin
        .from("ai_resume_previews")
        .select("preview_data")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      purchased: !!purchase,
      preview: preview?.preview_data ?? null,
    });
  } catch {
    return NextResponse.json({ purchased: false, preview: null });
  }
}
