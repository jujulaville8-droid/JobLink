import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Ensure caller is an employer/admin account in our users table
    const { data: caller } = await admin
      .from('users')
      .select('role, is_admin')
      .eq('id', user.id)
      .single()

    if (!caller || (caller.role !== 'employer' && !caller.is_admin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only create checkout for the authenticated user's own company
    const { data: company, error } = await admin
      .from('companies')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (error || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const params: Record<string, unknown> = {
      mode: 'subscription' as const,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      metadata: { company_id: company.id, user_id: user.id },
    }

    if (company.stripe_customer_id) {
      params.customer = company.stripe_customer_id
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create(
      params as Parameters<typeof stripe.checkout.sessions.create>[0]
    )

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Error creating checkout session:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
