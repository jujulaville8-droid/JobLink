import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login?returnTo=/profile/cv", origin)
      );
    }

    const admin = createAdminClient();

    // Check if already purchased
    const { data: existing } = await admin
      .from("ai_purchases")
      .select("id")
      .eq("user_id", user.id)
      .eq("feature", "smart_resume")
      .maybeSingle();

    if (existing) {
      return NextResponse.redirect(new URL("/profile/cv", origin));
    }

    const params: Record<string, unknown> = {
      mode: "payment" as const,
      line_items: [
        { price: process.env.STRIPE_SMART_RESUME_PRICE_ID!, quantity: 1 },
      ],
      success_url: `${origin}/profile/cv?unlock=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile/cv`,
      metadata: {
        user_id: user.id,
        purchase_type: "smart_resume",
      },
    };

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      params as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    if (!session.url) {
      return NextResponse.redirect(
        new URL("/profile/cv?error=checkout-failed", origin)
      );
    }

    return NextResponse.redirect(session.url);
  } catch (err) {
    console.error("Error creating smart resume checkout:", err);
    return NextResponse.redirect(
      new URL("/profile/cv?error=server-error", origin)
    );
  }
}

// POST version for client-side fetch — returns the URL instead of redirecting
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("ai_purchases")
      .select("id")
      .eq("user_id", user.id)
      .eq("feature", "smart_resume")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ url: "/profile/cv" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price: process.env.STRIPE_SMART_RESUME_PRICE_ID!, quantity: 1 },
      ],
      success_url: `${origin}/profile/cv?unlock=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile/cv`,
      metadata: {
        user_id: user.id,
        purchase_type: "smart_resume",
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Error creating smart resume checkout:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
