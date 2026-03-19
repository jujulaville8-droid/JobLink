import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get company and active subscription
    const { data: company } = await admin
      .from('companies')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (!company?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
    }

    const { data: subscription } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .single()

    if (!subscription?.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
    }

    // Cancel at period end so they keep Pro until the billing cycle ends
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error canceling subscription:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
