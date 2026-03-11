import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // First, refresh the session (handles cookie management)
  const response = await updateSession(request)

  const { pathname } = request.nextUrl

  // Build a supabase client to check auth state for route protection
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // We don't need to set cookies here — updateSession already handled it
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect authenticated users away from auth pages
  const authPages = ['/login', '/signup']
  if (user && authPages.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users away from protected pages
  const protectedPrefixes = ['/dashboard', '/profile', '/settings', '/applications', '/saved', '/post-job', '/my-listings', '/company-profile', '/admin', '/alerts']
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
