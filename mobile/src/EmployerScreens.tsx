import { memo, useEffect, useRef, useState } from 'react'
import { FlatList, ScrollView, Text, View } from 'react-native'
import { db, friendly } from './client'
import { useAccount } from './Auth'
import { Button, CardGap, Empty, Field, s, Skeletons, useStaleRefresh } from './ui'
import { website } from './AccountScreens'

type Company = { id: string; company_name: string }
type Listing = { id: string; title: string; status: string; company_id: string }

export const EmployerHome = memo(function EmployerHome({ active, top, signIn }: { active: boolean; top: number; signIn: () => void }) {
  const scroller = useRef<ScrollView>(null)
  useEffect(() => { if (active && top) scroller.current?.scrollTo({ y: 0, animated: true }) }, [top])
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
  return <ScrollView ref={scroller} contentContainerStyle={s.content}>
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

type Candidate = {
  id: string; first_name: string; last_name: string; bio: string | null; skills: string[] | null
  location: string | null; experience_years: number | null; education: string | null
  visibility: string
}
// Deliberately excludes contact details, CV paths and CV content.
const candidateFields = 'id,first_name,last_name,bio,skills,location,experience_years,education,visibility'
const CandidateCard = memo(function CandidateCard({ candidate }: { candidate: Candidate }) {
  return <View style={s.card}>
    <Text style={s.cardTitle}>{candidate.first_name} {candidate.last_name}</Text>
    <Text style={s.label}>{candidate.bio?.slice(0, 50) || 'Job Seeker'}</Text>
    <Text style={s.small}>{candidate.location || 'Location not specified'} · {candidate.experience_years == null ? 'Experience not specified' : `${candidate.experience_years} ${candidate.experience_years === 1 ? 'year' : 'years'} experience`}</Text>
    <Text style={s.pillText}>{candidate.visibility === 'actively_looking' ? 'Actively Looking' : 'Open to Opportunities'}</Text>
    {!!candidate.bio && <Text style={s.body} numberOfLines={2}>{candidate.bio}</Text>}
    {!!candidate.education && <Text style={s.small}>{candidate.education}</Text>}
    {!!candidate.skills?.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {candidate.skills.slice(0, 4).map((skill, i) => <View key={i} style={s.pill}><Text style={s.pillText}>{skill}</Text></View>)}
    </View>}
  </View>
})

export const BrowseCandidates = memo(function BrowseCandidates({ active, top, signIn }: { active: boolean; top: number; signIn: () => void }) {
  const { session, loading } = useAccount()
  const userId = session?.user.id
  const list = useRef<FlatList<Candidate>>(null)
  const [result, setResult] = useState<{ userId: string; profiles: Candidate[] } | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useStaleRefresh(active, () => setReload(x => x + 1))
  useEffect(() => { if (active && top) list.current?.scrollToOffset({ offset: 0, animated: true }) }, [top])
  useEffect(() => { setResult(null); setSearch(''); setError('') }, [userId])
  useEffect(() => {
    if (!active || !userId) return
    let live = true
    setBusy(true); setError('')
    void (async () => {
      try {
        const profiles: Candidate[] = []
        // Page through eligible rows so matching isn't limited to the API's first page.
        for (let from = 0; ; from += 500) {
          const response = await db.from('seeker_profiles').select(candidateFields)
            .in('visibility', ['actively_looking', 'open']).gte('profile_complete_pct', 30)
            .not('first_name', 'is', null).neq('first_name', '')
            .not('last_name', 'is', null).neq('last_name', '')
            .order('updated_at', { ascending: false }).order('id').range(from, from + 499)
          if (!live) return
          if (response.error) throw response.error
          profiles.push(...response.data)
          if (response.data.length < 500) break
        }
        if (live) setResult({ userId, profiles })
      } catch (e) {
        if (live) setError(friendly(e instanceof Error ? e.message : (e as { message?: string } | null)?.message, 'Could not load candidates. Please try again.'))
      } finally { if (live) setBusy(false) }
    })()
    return () => { live = false }
  }, [active, userId, reload])
  if (loading) return <View style={s.list}><Skeletons /></View>
  if (!session) return <Empty icon="person-circle-outline" title="Sign in to hire" body="Sign in with your employer account to browse candidates here."><Button title="Sign in" onPress={signIn} /></Empty>
  const profiles = result && result.userId === userId ? result.profiles : []
  // The web's case-insensitive substring matching, extended to its safe profile fields.
  // This clone has no server-side CV matching API; never download CVs to search them.
  const keyword = search.trim().toLowerCase()
  const filtered = profiles.filter(profile => !keyword || [profile.first_name, profile.last_name,
    profile.bio, profile.location, profile.education, ...(profile.skills || []),
    profile.experience_years?.toString()].some(value => value?.toLowerCase().includes(keyword)))
  return <FlatList ref={list} data={error ? [] : filtered} keyExtractor={item => item.id}
    renderItem={({ item }) => <CandidateCard candidate={item} />} contentContainerStyle={s.list} ItemSeparatorComponent={CardGap}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    refreshing={busy && !!profiles.length} onRefresh={() => setReload(x => x + 1)}
    ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>
      <Text style={s.eyebrow}>EMPLOYER</Text><Text style={s.h1}>Browse Candidates</Text>
      <Text style={s.body}>Discover talent across Antigua and Barbuda.</Text>
      <Field label="Search candidates" placeholder="Search by name, skills, or bio..." value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      {!busy && !error && <Text style={s.small}>{filtered.length} {filtered.length === 1 ? 'candidate' : 'candidates'} found</Text>}
    </View>}
    ListEmptyComponent={busy ? <Skeletons /> : error
      ? <Empty icon="cloud-offline-outline" title="We couldn't load candidates" body={error}><Button title="Try again" onPress={() => setReload(x => x + 1)} /></Empty>
      : <Empty icon="people-outline" title="No candidates found" body={keyword ? 'Try a different name, skill or search term.' : 'Check back soon for candidates who are looking for opportunities.'} />}
  />
})
