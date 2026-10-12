import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, db } from './client'
type Account = { role: string; is_banned: boolean; email_verified: boolean }
type State = { session: Session | null; account: Account | null; loading: boolean; error: string; refresh: () => Promise<void> }
const Context = createContext<State>({ session: null, account: null, loading: true, error: '', refresh: async () => {} })
export const useAccount = () => useContext(Context)
export function Auth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  async function refresh() {
    const version = ++generation.current
    setError('')
    const { data: { session: current } } = await db.auth.getSession()
    if (!current) { setAccount(null); return }
    await api('auth/sync-verification', {})
    const { data, error: issue } = await db.from('users').select('role,is_banned,email_verified').eq('id', current.user.id).single()
    if (version !== generation.current) return
    if (issue) throw new Error('Could not check your account. Please try again.')
    setAccount(data)
  }
  useEffect(() => {
    let active = true
    db.auth.getSession().then(({ data, error }) => { if (active) { setSession(data.session); setLoading(false); if (error) setError(error.message) } })
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, next) => { if (active) { generation.current++; setSession(next) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    let active = true
    setAccount(null)
    if (session) refresh().catch(e => { if (active) setError(e.message) })
    return () => { active = false; generation.current++ }
  }, [session?.user.id])
  return <Context.Provider value={{ session, account, loading, error, refresh }}>{children}</Context.Provider>
}
