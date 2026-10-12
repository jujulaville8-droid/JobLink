import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { createClient as createTokenClient } from '@supabase/supabase-js'

export async function createClient() {
  // Native clients carry the user's access token instead of browser cookies.
  // auth.getUser() still validates it with Supabase; all reads/writes retain RLS.
  // Never fall back to browser credentials when an Authorization header exists.
  const authorization = (await headers()).get('authorization')
  if (authorization) {
    return createTokenClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }
    )
  }
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}
