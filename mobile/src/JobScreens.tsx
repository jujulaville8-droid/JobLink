import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, db, SITE } from './client'
import { useAccount } from './Auth'
import { getJobs, PAGE_SIZE, salary, types, type Job } from './jobs'
import { Button, C, Empty, Field, Icon, s } from './ui'

export function JobCard({ job, open, status }: { job: Job; open: (job: Job) => void; status?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${job.title} at ${job.company?.company_name || 'Employer'}`} onPress={() => open(job)} style={({ pressed }) => [s.card, pressed && { backgroundColor: C.wash }]}>
    <View style={s.row}>
      {job.company?.logo_url ? <Image source={{ uri: job.company.logo_url }} style={{ height: 44, width: 44, borderRadius: 12 }} />
        : <View style={{ backgroundColor: C.wash, padding: 12, borderRadius: 12 }}><Icon name="business-outline" /></View>}
      <View style={{ flex: 1 }}><Text style={s.label}>{job.company?.company_name || 'Employer'}</Text><Text style={[s.body, { fontSize: 13 }]}>{job.location}</Text></View>
      <Icon name="arrow-up-right-box-outline" size={20} />
    </View>
    <Text style={[s.h2, { fontSize: 19 }]}>{job.title}</Text>
    <View style={[s.row, { flexWrap: 'wrap' }]}><View style={s.pill}><Text style={s.pillText}>{types[job.job_type] || job.job_type}</Text></View>
      {status && <View style={[s.pill, { backgroundColor: '#FFF1DD' }]}><Text style={s.pillText}>{status}</Text></View>}
      {job.is_featured && <Text style={s.eyebrow}>FEATURED</Text>}
    </View><Text style={[s.body, { fontSize: 13 }]}>{salary(job)}</Text>
  </Pressable>
}

export function JobsScreen({ open }: { open: (job: Job) => void }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  async function load(next = 0) {
    const version = ++generation.current
    setBusy(true); setError('')
    try {
      const result = await getJobs(query, type, next)
      if (version !== generation.current) return
      setJobs(old => next ? [...old, ...result.jobs] : result.jobs); setCount(result.count); setPage(next)
    } catch (e) { if (version === generation.current) setError((e as Error).message) }
    finally { if (version === generation.current) setBusy(false) }
  }
  useEffect(() => { setJobs([]); setCount(0); void load(); return () => { generation.current++ } }, [query, type])
  return <FlatList data={jobs} keyExtractor={j => j.id} renderItem={({ item }) => <JobCard job={item} open={open} />}
    contentContainerStyle={s.content} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
    refreshing={busy && page === 0} onRefresh={() => load()}
    ListHeaderComponent={<View style={{ gap: 18, marginBottom: 20 }}>
      <Text style={s.eyebrow}>YOUR NEXT CHAPTER</Text><Text style={s.h1}>Good work.{'\n'}Closer to home.</Text>
      <Text style={s.body}>Find your next opportunity in Antigua & Barbuda.</Text>
      <View style={[s.row, { alignItems: 'flex-end' }]}><View style={{ flex: 1 }}><Field label="Search jobs" value={text} onChangeText={setText} placeholder="Role, company or keyword" returnKeyType="search" onSubmitEditing={() => setQuery(text)} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => setQuery(text)} style={[s.button, { width: 52 }]}><Icon name="search" color={C.white} /></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[['', 'All jobs'], ...Object.entries(types)].map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === type }} onPress={() => setType(value)} style={[s.pill, { paddingVertical: 11 }, value === type && { backgroundColor: C.teal }]}><Text style={[s.pillText, value === type && { color: C.white }]}>{label}</Text></Pressable>)}
      </ScrollView><View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.label}>{busy ? 'Finding opportunities…' : `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`}</Text>
        {(query || type) && <Pressable accessibilityRole="button" onPress={() => { setText(''); setQuery(''); setType('') }}><Text style={{ color: C.bright }}>Clear filters</Text></Pressable>}</View>
      {!!error && <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button secondary title="Try again" onPress={() => load()} /></>}
    </View>}
    ListEmptyComponent={!busy && !error ? <Empty title="No matches yet" body="Try another keyword or job type. New opportunities will appear here as employers post them." /> : null}
    ListFooterComponent={jobs.length < count ? <Button secondary busy={busy} title="Load more jobs" onPress={() => load(page + 1)} /> : <View style={{ height: 10 }} />}
  />
}

export function JobDetail({ job, close, signIn, onChanged }: { job: Job | null; close: () => void; signIn: () => void; onChanged: () => void }) {
  const { session, account } = useAccount()
  const [saved, setSaved] = useState(false)
  const [letter, setLetter] = useState('')
  const [applied, setApplied] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true; setSaved(false); setApplied(false); setLetter(''); setError('')
    if (job && session) void (async () => {
      const { data: profile } = await db.from('seeker_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
      if (!profile) return
      const [save, application] = await Promise.all([
        db.from('saved_jobs').select('id').eq('job_id', job.id).eq('seeker_id', profile.id).maybeSingle(),
        db.from('applications').select('id').eq('job_id', job.id).eq('seeker_id', profile.id).maybeSingle(),
      ])
      if (active) { setSaved(!!save.data); setApplied(!!application.data) }
    })()
    return () => { active = false }
  }, [job?.id, session?.user.id])
  if (!job) return null
  async function act(action: 'save' | 'apply') {
    if (!session) { close(); signIn(); return }
    setBusy(action); setError('')
    try {
      const result = await api<{ saved?: boolean }>(`jobs/${action}`, { job_id: job!.id, ...(action === 'apply' ? { cover_letter_text: letter.trim() } : {}) })
      if (action === 'save') setSaved(!!result.saved)
      else { setApplied(true); Alert.alert('Application sent', 'You can track its progress in Applications.') }
      onChanged()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={[s.row, { padding: 20, justifyContent: 'space-between' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close job details" onPress={close} style={{ padding: 8 }}><Icon name="close" /></Pressable><Text style={s.label}>Opportunity</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Share job" style={{ padding: 8 }} onPress={() => Share.share({ message: `${job.title} at ${job.company?.company_name || 'JobLinks'} — ${SITE}/jobs/${job.id}`, url: `${SITE}/jobs/${job.id}` }).catch(() => setError('Could not open sharing.'))}><Icon name="share-outline" /></Pressable>
    </View><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>{job.company?.company_name}</Text><Text style={s.h1}>{job.title}</Text>
      <Text style={s.body}>{job.location} · {types[job.job_type] || job.job_type}</Text><Text style={s.label}>{salary(job)}</Text>
      <View style={{ height: 1, backgroundColor: C.line }} /><Text style={s.h2}>About the role</Text><Text selectable style={[s.body, { color: C.ink }]}>{job.description}</Text>
      {job.expires_at && <Text style={s.body}>Closing date: {new Date(job.expires_at).toLocaleDateString(undefined, { timeZone: 'UTC' })}</Text>}
      {account?.role === 'employer' ? <Text style={s.body}>You’re signed in as an employer. Use a job-seeker account to apply.</Text> : <>
        {!applied && session && <Field label="Introduce yourself (optional)" multiline maxLength={5000} value={letter} onChangeText={setLetter} placeholder="Tell the employer why this role interests you." />}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Button title={applied ? 'Application submitted' : session ? 'Apply for this job' : 'Sign in to apply'} busy={busy === 'apply'} disabled={applied || !!busy} onPress={() => {
          if (!session) { close(); signIn(); return }
          Alert.alert('Send your application?', 'Your profile and introduction will be shared with the employer or JobLinks hiring team.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Send application', onPress: () => act('apply') }])
        }} />
        <Button secondary title={saved ? 'Remove from saved jobs' : 'Save for later'} busy={busy === 'save'} disabled={!!busy} onPress={() => act('save')} />
      </>}
    </ScrollView></SafeAreaView>
  </Modal>
}
