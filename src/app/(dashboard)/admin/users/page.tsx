import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { User } from '@/lib/types'

async function toggleBan(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const userId = formData.get('user_id') as string
  const currentlyBanned = formData.get('is_banned') === 'true'

  await supabase
    .from('users')
    .update({ is_banned: !currentlyBanned })
    .eq('id', userId)
}

async function toggleVerify(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const userId = formData.get('user_id') as string
  const currentlyVerified = formData.get('email_verified') === 'true'

  await supabase
    .from('users')
    .update({ email_verified: !currentlyVerified })
    .eq('id', userId)
}

interface UserWithProfile extends User {
  seeker_profiles?: { first_name: string; last_name: string }[] | null
  companies?: { company_name: string }[] | null
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string }>
}) {
  await requireRole('admin')
  const supabase = await createClient()
  const params = await searchParams

  const search = params.search || ''
  const roleFilter = params.role || ''

  let query = supabase
    .from('users')
    .select('*, seeker_profiles(first_name, last_name), companies(company_name)')
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('email', `%${search}%`)
  }

  if (roleFilter && roleFilter !== 'all') {
    query = query.eq('role', roleFilter)
  }

  const { data: users, error } = await query

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading users: {error.message}</p>
      </div>
    )
  }

  const typedUsers = (users || []) as UserWithProfile[]

  function getDisplayName(user: UserWithProfile): string {
    if (user.role === 'seeker' && user.seeker_profiles?.length) {
      const p = user.seeker_profiles[0]
      return `${p.first_name} ${p.last_name}`.trim() || '-'
    }
    if (user.role === 'employer' && user.companies?.length) {
      return user.companies[0].company_name || '-'
    }
    return '-'
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-primary mb-6">User Management</h1>

      {/* Filters */}
      <form method="GET" className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search by email..."
          className="flex-1 px-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          name="role"
          defaultValue={roleFilter}
          className="px-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Roles</option>
          <option value="seeker">Seeker</option>
          <option value="employer">Employer</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Users Table */}
      <div className="overflow-x-auto bg-white rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-text">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-text">Name / Company</th>
              <th className="text-left px-4 py-3 font-semibold text-text">Role</th>
              <th className="text-center px-4 py-3 font-semibold text-text">Verified</th>
              <th className="text-center px-4 py-3 font-semibold text-text">Banned</th>
              <th className="text-left px-4 py-3 font-semibold text-text">Created</th>
              <th className="text-center px-4 py-3 font-semibold text-text">Actions</th>
            </tr>
          </thead>
          <tbody>
            {typedUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-text-light">
                  No users found.
                </td>
              </tr>
            ) : (
              typedUsers.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-text">{user.email}</td>
                  <td className="px-4 py-3 text-text-light">{getDisplayName(user)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : user.role === 'employer'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.email_verified ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-red-500 font-medium">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.is_banned ? (
                      <span className="text-red-600 font-medium">Banned</span>
                    ) : (
                      <span className="text-text-light">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-light whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <form action={toggleBan}>
                        <input type="hidden" name="user_id" value={user.id} />
                        <input type="hidden" name="is_banned" value={String(user.is_banned)} />
                        <button
                          type="submit"
                          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                            user.is_banned
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {user.is_banned ? 'Unban' : 'Ban'}
                        </button>
                      </form>
                      <form action={toggleVerify}>
                        <input type="hidden" name="user_id" value={user.id} />
                        <input type="hidden" name="email_verified" value={String(user.email_verified)} />
                        <button
                          type="submit"
                          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                            user.email_verified
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                        >
                          {user.email_verified ? 'Unverify' : 'Verify'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
