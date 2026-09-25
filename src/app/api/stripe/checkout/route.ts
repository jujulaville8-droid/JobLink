import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireVerifiedUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  try {
    // Auth check server-side. This entry point is a browser navigation, so an
    // unauthenticated or unverified visitor is redirected rather than shown JSON.
    const auth = await requireVerifiedUser()
    if ('error' in auth) {
      const destination =
        auth.error.status === 401 ? '/login?returnTo=/employers/upgrade' : '/verify-email'
      return NextResponse.redirect(new URL(destination, origin))
    }
    const { user } = auth

    const admin = createAdminClient()

    // Try to find the company — but don't require it
    const { data: company } = await admin
      .from('companies')
      .select('id, stripe_customer_id, is_pro')
      .eq('user_id', user.id)
      .maybeSingle()

    if (company?.is_pro) {
      return NextResponse.redirect(new URL('/dashboard', origin))
    }

    // Build checkout session — works with or without a company profile
    const params: Record<string, unknown> = {
      mode: 'subscription' as const,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/employers/upgrade`,
      metadata: {
        user_id: user.id,
        ...(company?.id ? { company_id: company.id } : {}),
      },
    }

    // Reuse existing Stripe customer if we have one
    if (company?.stripe_customer_id) {
      params.customer = company.stripe_customer_id
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create(
      params as Parameters<typeof stripe.checkout.sessions.create>[0]
    )

    if (!session.url) {
      return NextResponse.redirect(new URL('/employers/upgrade?error=checkout-failed', origin))
    }

    return NextResponse.redirect(session.url)
  } catch (err) {
    console.error('Error creating checkout session:', err)
    return NextResponse.redirect(new URL('/employers/upgrade?error=server-error', origin))
  }
}
