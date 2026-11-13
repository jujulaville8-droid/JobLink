import { CheckoutRefused, createVerificationCheckout } from '@/lib/verification/payment'
import {
  sameOrigin, verificationCheckoutEnabled, verificationJson, verificationLimit, verificationNotFound, verificationSeeker,
} from '@/lib/verification/server'

/** Creates the verification and its Stripe Checkout Session. */
export async function POST(request: Request) {
  if (!verificationCheckoutEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const limited = await verificationLimit('checkout', seeker.user.id)
  if (limited) return limited
  try {
    return verificationJson({ url: await createVerificationCheckout(seeker) })
  } catch (error) {
    if (error instanceof CheckoutRefused) return verificationJson({ error: error.message, code: error.code }, 409)
    console.error('[verification-checkout] Failed')
    return verificationJson({ error: 'We could not start the payment. You have not been charged. Try again.' }, 503)
  }
}
