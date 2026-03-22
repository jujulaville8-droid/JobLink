import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    // Auth check server-side — no client JS needed
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?returnTo=/employers/upgrade`
      )
    }

    const admin = createAdminClient()

    // Look up the company for this user
    const { data: company, error } = await admin
      .from('companies')
      .select('id, stripe_customer_id, is_pro')
      .eq('user_id', user.id)
      .single()

    if (error || !company) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/employers/upgrade?error=no-company`
      )
    }

    if (company.is_pro) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
    }

    // Build checkout session params
    const params: Record<string, unknown> = {
      mode: 'subscription' as const,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/employers/upgrade`,
      metadata: { company_id: company.id },
    }

    // Reuse existing Stripe customer if we have one
    if (company.stripe_customer_id) {
      params.customer = company.stripe_customer_id
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create(
      params as Parameters<typeof stripe.checkout.sessions.create>[0]
    )

    if (!session.url) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/employers/upgrade?error=checkout-failed`
      )
    }

    return NextResponse.redirect(session.url)
  } catch (err) {
    console.error('Error creating checkout session:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/employers/upgrade?error=server-error`
    )
  }
}
