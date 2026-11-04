import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Linking } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { api, db, friendly } from './client'
import { completeOAuthFromUrl } from './oauth'
import { useStaleRefresh } from './ui'
type Account = { role: string; is_banned: boolean; email_verified: boolean }
type State = { session: Session | null; account: Account | null; loading: boolean; error: string; refresh: () => Promise<void> }
const Context = createContext<State>({ session: null, account: null, loading: true, error: '', refresh: async () => {} })
export const useAccount = () => useContext(Context)

/** What the signed-in seeker has saved and applied to, so a job opens showing the right state. */
type Marks = {
  status: 'idle' | 'loading' | 'ready' | 'error'; profileId: string | null; saved: Set<string>; applied: Set<string>
  markSaved: (jobId: string, saved: boolean) => void; markApplied: (jobId: string) => void; reload: () => Promise<void>
}
const none = new Set<string>()
const MarksContext = createContext<Marks>({ status: 'idle', profileId: null, saved: none, applied: none, markSaved: () => {}, markApplied: () => {}, reload: async () => {} })
export const useMarks = () => useContext(MarksContext)

function MarksProvider({ children }: { children: ReactNode }) {
  const { session, account } = useAccount()
  const userId = session?.user.id
  const seeker = account?.role === 'seeker'
  const [status, setStatus] = useState<Marks['status']>('idle')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [saved, setSaved] = useState(none)
  const [applied, setApplied] = useState(none)
  const generation = useRef(0)
  const load = useCallback(async (quiet: boolean) => {
    const version = ++generation.current
    if (!userId || !seeker) return
    if (!quiet) setStatus('loading')
    try {
      const profile = await db.from('seeker_profiles').select('id').eq('user_id', userId).maybeSingle()
      if (profile.error) throw profile.error
      const id = profile.data?.id ?? null
      const lists = id ? await Promise.all([
        db.from('saved_jobs').select('job_id').eq('seeker_id', id),
        db.from('applications').select('job_id').eq('seeker_id', id),
      ]) : null
      if (lists?.[0].error || lists?.[1].error) throw lists[0].error || lists[1].error
      if (version !== generation.current) return
      setProfileId(id)
      setSaved(new Set((lists?.[0].data ?? []).map(row => row.job_id as string)))
      setApplied(new Set((lists?.[1].data ?? []).map(row => row.job_id as string)))
      setStatus('ready')
    } catch {
      // A failed background refresh keeps the state we already know.
      if (version === generation.current && !quiet) setStatus('error')
    }
  }, [userId, seeker])
  useEffect(() => {
    setStatus('idle'); setProfileId(null); setSaved(none); setApplied(none)
    void load(false)
    return () => { generation.current++ }
  }, [load])
  useStaleRefresh(status === 'ready', () => { void load(true) })
  const value = useMemo<Marks>(() => ({
    status, profileId, saved, applied,
    // Bumping the generation drops any refresh that started before this change.
    markSaved: (jobId, on) => {
      generation.current++
      setSaved(old => { const next = new Set(old); if (on) next.add(jobId); else next.delete(jobId); return next })
    },
    markApplied: jobId => { generation.current++; setApplied(old => new Set(old).add(jobId)) },
    reload: () => load(status === 'ready'),
  }), [status, profileId, saved, applied, load])
  return <MarksContext.Provider value={value}>{children}</MarksContext.Provider>
}

export function Auth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  async function refresh() {
    const version = ++generation.current
    setError('')
    try {
      // Reuse the session already in state: a second getSession() here can stall
      // behind the client's own background refresh of the very same session.
      const current = session ?? (await db.auth.getSession()).data.session
      if (!current) { setAccount(null); return }
      const read = () => db.from('users').select('role,is_banned,email_verified').eq('id', current.user.id).maybeSingle()
      const first = await read()
      if (version !== generation.current) return
      if (first.error) throw new Error(friendly(first.error.message, 'Could not check your account. Please try again.'))
      if (first.data) setAccount(first.data)
      if (first.data?.email_verified) { setError(''); return }
      // Only an unverified or missing row needs the website: this route also creates a missing row.
      try { await api('auth/sync-verification', {}) }
      catch (e) { if (first.data) { setError(''); return } throw e }
      const second = await read()
      if (version !== generation.current) return
      if (second.data) setAccount(second.data)
      else if (!first.data) throw new Error('Could not check your account. Please try again.')
      setError('') // Resolved; also clears a watchdog error raised while this ran slowly.
    } catch (e) {
      if (version === generation.current) setError((e as Error).message)
    }
  }
  useEffect(() => {
    let active = true
    db.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session); setLoading(false)
      if (!error) return
      if (/refresh token/i.test(error.message)) {
        // The persisted session is unrecoverable. Drop it locally so the app
        // starts signed out instead of wedging on the same dead token again.
        void db.auth.signOut({ scope: 'local' }).catch(() => {})
      } else setError(error.message)
    })
      .catch(() => { if (active) setLoading(false) }) // Unreadable storage counts as signed out; don't hold the splash.
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, next) => { if (active) { generation.current++; setSession(next) } })
    Linking.getInitialURL().then(url => { if (url) void completeOAuthFromUrl(url).catch(() => {}) }).catch(() => {})
    const linkSub = Linking.addEventListener('url', event => { void completeOAuthFromUrl(event.url).catch(() => {}) })
    return () => { active = false; subscription.unsubscribe(); linkSub.remove() }
  }, [])
  useEffect(() => {
    setAccount(null)
    if (session) void refresh()
    return () => { generation.current++ }
  }, [session?.user.id])
  // Watchdog: if a live session's account read has not settled within 20s,
  // surface the standard account error (whose buttons re-run refresh) instead
  // of leaving the account-gated screens on skeletons and spinners forever.
  useEffect(() => {
    if (!session || account || error) return
    const timer = setTimeout(() => setError('Could not check your account. Please try again.'), 20000)
    return () => clearTimeout(timer)
  }, [session?.user.id, account, error])
  return <Context.Provider value={{ session, account, loading, error, refresh }}><MarksProvider>{children}</MarksProvider></Context.Provider>
}
