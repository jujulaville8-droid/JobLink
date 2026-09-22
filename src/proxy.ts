import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === 'true' && !request.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>JobLinks temporarily unavailable</title><main><h1>We will be back shortly</h1><p>JobLinks is undergoing maintenance. Please try again later.</p></main></html>', {
      status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '300', 'Cache-Control': 'no-store' },
    })
  }
  return await updateSession(request)
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
