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

  // Public paths — no auth or verification required.
  // /jobs and /jobs/[id] MUST be public so Google can crawl/index them.
  const publicPaths = [
    '/login', '/signup', '/employer/login', '/employer/signup',
    '/forgot-password', '/reset-password', '/verify-email',
    '/auth/', '/about', '/privacy', '/terms', '/explore',
    '/api/', '/companies', '/employers/upgrade', '/jobs',
  ]
  const isPublic = pathname === '/' || publicPaths.some(p => pathname.startsWith(p))

  // Protected paths — require login, redirect to signup if not authenticated.
  // /browse-jobs is the dashboard variant; the public /jobs is open.
  const authRequiredPaths = ['/browse-jobs']
  const requiresAuth = authRequiredPaths.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (requiresAuth && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/signup'
    return NextResponse.redirect(url)
  }

  if (!isPublic && user) {
    const { data: userData } = await supabase
      .from('users')
      .select('email_verified, is_banned, is_admin')
      .eq('id', user.id)
      .single()

    // A banned account keeps its session but loses access to everything behind
    // the login. Previously is_banned was only checked when applying to a job,
    // so a ban did almost nothing. The homepage is public, so this cannot loop.
    if (userData?.is_banned === true) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = '?suspended=1'
      return NextResponse.redirect(url)
    }

    // Admin accounts are exempt, so server-side automation is not gated on an
    // inbox. is_admin is service-managed and cannot be self-granted.
    let isVerified = userData?.is_admin === true || !!user.email_confirmed_at

    if (isVerified && userData?.is_admin !== true) {
      if (!userData || userData.email_verified !== true) {
        // Auth says verified but the database row does not. Repair it with the
        // service role -- a safety net for a failed verify-confirm sync.
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (serviceKey && supabaseUrl) {
          try {
            const admin = createAdminClientRaw(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })

            // supabase-js RETURNS errors rather than throwing them, so the
            // result has to be inspected. The previous try/catch could never
            // fire, and a failed repair was silently treated as success.
            const { error: syncError } = userData
              ? await admin
                  .from('users')
                  .update({ email_verified: true })
                  .eq('id', user.id)
              : await admin.from('users').insert({
                  id: user.id,
                  email: user.email!,
                  role: user.user_metadata?.role === 'employer' ? 'employer' : 'seeker',
                  email_verified: true,
                })

            if (syncError) {
              console.error('[auth-middleware] Auto-sync failed:', syncError.message)
              isVerified = false
            }
          } catch (syncErr) {
            console.error('[auth-middleware] Auto-sync threw:', syncErr)
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
