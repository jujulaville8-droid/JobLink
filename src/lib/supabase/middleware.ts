import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session — important for Server Components
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unverified users to /verify-email (except public & auth pages)
  const pathname = request.nextUrl.pathname
  const publicPaths = [
    '/login', '/signup', '/employer/login', '/employer/signup',
    '/forgot-password', '/reset-password', '/verify-email',
    '/auth/', '/about', '/privacy', '/terms', '/explore',
    '/api/', '/companies',
  ]
  const isPublic = pathname === '/' || publicPaths.some(p => pathname.startsWith(p))

  if (user && !isPublic) {
    // Check both auth-level confirmation and database-level verification
    let isVerified = !!user.email_confirmed_at

    if (isVerified) {
      const { data: userData } = await supabase
        .from('users')
        .select('email_verified')
        .eq('id', user.id)
        .single()

      if (userData?.email_verified === false) {
        isVerified = false
      }
    }

    if (!isVerified) {
      const url = request.nextUrl.clone()
      url.pathname = '/verify-email'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
