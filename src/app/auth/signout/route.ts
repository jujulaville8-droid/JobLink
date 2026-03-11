import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // We handle cookie deletion below on the redirect response directly
        },
      },
    }
  )

  await supabase.auth.signOut()

  const url = new URL('/login', request.url)
  const response = NextResponse.redirect(url, { status: 302 })

  // Manually delete all Supabase auth cookies from the redirect response
  // so the browser actually clears them when it follows the redirect
  const allCookies = cookieStore.getAll()
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.delete(cookie.name)
    }
  }

  return response
}
