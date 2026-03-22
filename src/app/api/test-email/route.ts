import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

// Temporary test route — DELETE after testing
export async function GET() {
  await sendEmail({
    to: 'julianlaville@gmail.com',
    type: 'resume_nudge',
    data: { applicant_name: 'Julian' },
  })

  return NextResponse.json({ sent: true })
}
