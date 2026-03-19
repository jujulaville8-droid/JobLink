import { redirect } from 'next/navigation'

export default function EmployerSignupRedirect() {
  redirect('/signup?role=employer')
}
