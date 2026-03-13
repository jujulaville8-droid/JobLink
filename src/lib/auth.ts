import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export async function getUserRole() {
  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    // Fall back to user metadata if the users table row doesn't exist yet
    return (user.user_metadata?.role as string) ?? null
  }

  return data.role as string
}

export async function requireAuth() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireRole(role: string) {
  const user = await requireAuth()

  // For admin role, check the is_admin flag (persists across role switches)
  if (role === 'admin') {
    const supabase = await createClient()
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!data?.is_admin) {
      redirect('/')
    }
    return user
  }

  const userRole = await getUserRole()

  if (userRole !== role) {
    redirect('/')
  }

  return user
}
