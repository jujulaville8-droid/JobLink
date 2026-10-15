import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { stripBackslashes } from '@/lib/backslash-path'

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const cleanPath = stripBackslashes(request.nextUrl.pathname)
  if (cleanPath !== null) {
    const url = request.nextUrl.clone()
    url.pathname = cleanPath
    return NextResponse.redirect(url, 308)
  }
  return await updateSession(request, event)
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
