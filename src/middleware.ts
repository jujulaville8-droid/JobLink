import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Refresh session and get the authenticated user in one pass
  const { response, user } = await updateSession(request)

  const { pathname } = request.nextUrl

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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
