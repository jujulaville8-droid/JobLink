import { redirect } from 'next/navigation'
import { withReturnTo } from '@/lib/claim-links'

export default async function EmployerSignupRedirect({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  redirect(withReturnTo('/signup?role=employer', (await searchParams).returnTo))
}
