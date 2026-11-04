import { memo, useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { db, friendly } from './client'
import { useAccount } from './Auth'
import { Button, Empty, s, Skeletons, useStaleRefresh } from './ui'
import { website } from './AccountScreens'

type Company = { id: string; company_name: string }
type Listing = { id: string; title: string; status: string; company_id: string }

export const EmployerHome = memo(function EmployerHome({ active, signIn }: { active: boolean; signIn: () => void }) {
  const { session, loading } = useAccount()
  const [companies, setCompanies] = useState<Company[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const loadedFor = useRef<string | null>(null)
  useStaleRefresh(active, () => setReload(x => x + 1))
  useEffect(() => {
    if (!active) return
    // A shared phone must never flash the previous account's companies.
    if (loadedFor.current !== (session?.user.id ?? null)) { loadedFor.current = session?.user.id ?? null; setCompanies([]); setListings([]) }
    if (!session) { setBusy(false); return }
    let live = true
    setBusy(true); setError('')
    void (async () => {
      try {
        const owned = await db.from('companies').select('id,company_name').eq('user_id', session.user.id).order('company_name')
        if (owned.error) throw new Error(friendly(owned.error.message, 'Could not load your companies. Please try again.'))
        let posted: Listing[] = []
        if (owned.data.length) {
          const result = await db.from('job_listings').select('id,title,status,company_id').in('company_id', owned.data.map(company => company.id)).order('created_at', { ascending: false }).limit(100)
          if (result.error) throw new Error(friendly(result.error.message, 'Could not load your vacancies. Please try again.'))
          posted = result.data
        }
        if (live) { setCompanies(owned.data); setListings(posted) }
      } catch (e) { if (live) setError((e as Error).message) }
      finally { if (live) setBusy(false) }
    })()
    return () => { live = false }
  }, [active, session?.user.id, reload])
  if (loading || (busy && !companies.length && !error)) return <View style={s.list}><Skeletons /></View>
  if (!session) return <Empty icon="person-circle-outline" title="Sign in to hire" body="Sign in with your employer account to see your companies and vacancies here."><Button title="Sign in" onPress={signIn} /></Empty>
  if (error) return <Empty icon="cloud-offline-outline" title="We couldn't load your employer view" body={error}><Button title="Try again" onPress={() => setReload(x => x + 1)} /></Empty>
  if (!companies.length) return <Empty icon="briefcase-outline" title="No company here yet" body="This account has no company on JobLinks yet. Post your first vacancy on the JobLinks website and your company and vacancies will appear here."><Button title="Post a job on the website" onPress={() => website('/employers')} /></Empty>
  return <ScrollView contentContainerStyle={s.content}>
    <Text style={s.eyebrow}>EMPLOYER</Text>
    <Text style={s.h1}>Your hiring home.</Text>
    <Text style={s.body}>Your companies and vacancies, live from JobLinks. Posting, editing and applicant management happen on the website.</Text>
    <Button title="Manage on the website" onPress={() => website('/my-listings')} />
    {companies.map(company => {
      const vacancies = listings.filter(l => l.company_id === company.id)
      return <View key={company.id} style={{ gap: 12 }}>
        <Text style={s.h2}>{company.company_name}</Text>
        {vacancies.length ? vacancies.map(listing => <View key={listing.id} style={s.card}>
          <Text style={s.cardTitle}>{listing.title}</Text>
          <Text style={s.pillText}>{listing.status.replaceAll('_', ' ')}</Text>
        </View>) : <Text style={s.body}>No vacancies posted yet.</Text>}
      </View>
    })}
  </ScrollView>
})
