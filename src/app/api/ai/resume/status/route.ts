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

    const [{ data: purchase, error: purchaseError }, { data: preview, error: previewError }] = await Promise.all([
      admin
        .from("ai_purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("feature", "smart_resume").limit(1)
        .maybeSingle(),
      admin
        .from("ai_resume_previews")
        .select("preview_data, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (purchaseError || previewError) throw purchaseError || previewError;
    return NextResponse.json({
      previewCreatedAt: preview?.created_at ?? null,
      purchased: !!purchase,
      preview: preview?.preview_data ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Resume service temporarily unavailable" }, { status: 503 });
  }
}
