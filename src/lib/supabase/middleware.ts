import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClientRaw } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[auth-middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
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

  const pathname = request.nextUrl.pathname

  // Public paths — no auth or verification required
  const publicPaths = [
    '/login', '/signup', '/employer/login', '/employer/signup',
    '/forgot-password', '/reset-password', '/verify-email',
    '/auth/', '/about', '/privacy', '/terms', '/explore',
    '/api/', '/companies',
  ]
  const isPublic = pathname === '/' || publicPaths.some(p => pathname.startsWith(p))

  if (!isPublic && user) {
    // Check auth-level verification (primary source of truth)
    let isVerified = !!user.email_confirmed_at

    if (isVerified) {
      // Also check database-level verification (synchronized on callback)
      const { data: userData } = await supabase
        .from('users')
        .select('email_verified')
        .eq('id', user.id)
        .single()

      if (!userData || userData.email_verified !== true) {
        // Auth says verified but DB doesn't — try to auto-sync using admin client.
        // This is a safety net for when the verify-confirm page's sync failed
        // (e.g., RLS blocked it or network error).
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (serviceKey && supabaseUrl) {
          try {
            const admin = createAdminClientRaw(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })

            if (userData) {
              await admin
                .from('users')
                .update({ email_verified: true })
                .eq('id', user.id)
            } else {
              await admin.from('users').insert({
                id: user.id,
                email: user.email!,
                role: (user.user_metadata?.role as string) || 'seeker',
                email_verified: true,
              })
            }
            console.log('[auth-middleware] Auto-synced email_verified for user', user.id)
            // Sync succeeded — user is verified, don't block
          } catch (syncErr) {
            console.error('[auth-middleware] Auto-sync failed', syncErr)
            isVerified = false
          }
        } else {
          isVerified = false
        }
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
