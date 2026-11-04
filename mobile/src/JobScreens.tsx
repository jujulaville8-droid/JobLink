import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Keyboard, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, SITE, SLOW_TIMEOUT } from './client'
import { useAccount, useMarks } from './Auth'
import { getJobs, hasSalary, isClosed, PAGE_SIZE, posted, salary, types, type Job } from './jobs'
import { Button, C, CardGap, Empty, Field, Icon, KeyboardArea, Press, s, Skeletons, ToastHost, useStaleRefresh, useToast } from './ui'

const statuses: Record<string, { label: string; color: string; text: string }> = {
  applied: { label: 'Applied', color: C.line, text: C.ink },
  interview: { label: 'Interview', color: C.teal, text: C.white },
  hold: { label: 'On hold', color: C.amberWash, text: C.amberText },
  rejected: { label: 'Not selected', color: C.grey, text: C.muted },
}
function Pill({ label, color = C.wash, text = C.teal }: { label: string; color?: string; text?: string }) {
  return <View style={[s.pill, { backgroundColor: color }]}><Text style={[s.pillText, { color: text }]}>{label}</Text></View>
}
const featured = { color: C.amberWash, text: C.amberText }
const closed = { color: C.grey, text: C.muted }
const freshBadge = { color: '#F9E3EC', text: '#9C2B4E' }
const urgentBadge = { color: '#FDECEA', text: C.red }

/** Indeed-style fact pill: a check and a label on a tinted wash. */
function CheckPill({ label, color = C.greenWash, text = C.green }: { label: string; color?: string; text?: string }) {
  return <View style={[s.pill, { backgroundColor: color, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
    <Icon name="checkmark" size={14} color={text} />
    <Text style={[s.pillText, { color: text }]}>{label}</Text>
  </View>
}

// Logos that failed once stay failed for the session: a recycled card must not
// retry the same broken URL and flicker between the image and the fallback.
const failedLogos = new Set<string>()
/** A fixed tile, so a slow logo fades in over colour and a failed one falls back to the icon. */
function Logo({ company, size = 44, radius = 12 }: { company: Job['company']; size?: number; radius?: number }) {
  const uri = company?.logo_url
  const [failedUri, setFailedUri] = useState<string | null>(null)
  const failed = !!uri && (failedLogos.has(uri) || failedUri === uri)
  return <View style={{ height: size, width: size, borderRadius: radius, overflow: 'hidden', backgroundColor: C.wash, alignItems: 'center', justifyContent: 'center' }}>
    {uri && !failed ? <Image source={{ uri }} style={{ height: size, width: size }} resizeMode="contain" onError={() => { failedLogos.add(uri); setFailedUri(uri) }} /> : <Icon name="business-outline" />}
  </View>
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'Apply by Nov 20' for an open job with a valid future closing date, otherwise null. */
function applyBy(job: Job) {
  if (!job.expires_at || isClosed(job)) return null
  const date = new Date(job.expires_at)
  if (!(date.getTime() > Date.now())) return null // Also false for an unparseable date (NaN).
  return `Apply by ${MONTHS[date.getMonth()]} ${date.getDate()}`
}

const DAY_MS = 86400000
/** Posted within the last 48 hours. */
function isFresh(job: Job) {
  const age = Date.now() - new Date(job.created_at).getTime()
  return Number.isFinite(age) && age >= 0 && age < 2 * DAY_MS
}
/** Open, with a valid closing date inside the next 3 days. */
function isClosingSoon(job: Job) {
  if (!job.expires_at || isClosed(job)) return false
  const left = new Date(job.expires_at).getTime() - Date.now()
  return Number.isFinite(left) && left > 0 && left <= 3 * DAY_MS
}

type JobCardProps = { job: Job; open: (job: Job) => void; status?: string }
/** Compares only what the card renders, so a background refresh that returns the
 * same rows does not repaint every visible card. Saved and applied state comes
 * through context, which still re-renders the card on its own. */
function sameCard(prev: JobCardProps, next: JobCardProps) {
  const a = prev.job; const b = next.job
  return prev.open === next.open && prev.status === next.status
    && a.id === b.id && a.title === b.title && a.location === b.location && a.job_type === b.job_type
    && a.category === b.category && a.status === b.status && a.created_at === b.created_at && a.expires_at === b.expires_at
    && a.is_featured === b.is_featured && a.salary_min === b.salary_min && a.salary_max === b.salary_max && a.salary_visible === b.salary_visible
    && (a.company?.company_name ?? null) === (b.company?.company_name ?? null) && (a.company?.logo_url ?? null) === (b.company?.logo_url ?? null)
}
export const JobCard = memo(function JobCard({ job, open, status }: JobCardProps) {
  const marks = useMarks()
  const { session } = useAccount()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const pill = status ? statuses[status] ?? { label: status, color: C.line, text: C.ink } : marks.applied.has(job.id) ? statuses.applied : null
  const company = job.company?.company_name || 'Employer'
  const location = job.location?.trim()
  const closes = applyBy(job)
  const saved = marks.saved.has(job.id)
  const fresh = isFresh(job)
  const closingSoon = isClosingSoon(job)
  async function toggleSave() {
    if (!session) { toast('Sign in to save this job'); return }
    // Until we know what this seeker has saved, a tap could undo a save.
    if (marks.status !== 'ready' || saving) return
    setSaving(true)
    try {
      const result = await api<{ saved?: boolean }>('jobs/save', { job_id: job.id, saved: !saved })
      marks.markSaved(job.id, !!result.saved)
      toast(result.saved ? 'Saved for later' : 'Removed from saved')
    } catch (e) { toast((e as Error).message) }
    finally { setSaving(false) }
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${job.title} at ${company}`} onPress={() => open(job)} style={({ pressed }) => [s.card, { padding: 20, gap: 12, borderRadius: 20 }, pressed && { backgroundColor: C.wash }]}>
    <View style={[s.row, { alignItems: 'center' }]}>
      <Logo company={job.company} size={52} radius={14} />
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {fresh && <Pill label="New" {...freshBadge} />}
        {closingSoon && <Pill label="Closing soon" {...urgentBadge} />}
      </View>
      <Press accessibilityLabel={saved ? 'Remove from saved jobs' : 'Save for later'} accessibilityState={{ selected: saved, busy: saving }} onPress={() => void toggleSave()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        {saving ? <ActivityIndicator color={C.teal} size="small" /> : <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? C.teal : C.ink} />}
      </Press>
    </View>
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -.4, color: C.ink }} numberOfLines={2}>{job.title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 20, color: C.muted }} numberOfLines={1}>{company}</Text>
      {!!location && <Text style={{ fontSize: 15, lineHeight: 20, color: C.muted }} numberOfLines={1}>{location}</Text>}
    </View>
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      {hasSalary(job) && <CheckPill label={salary(job)} />}
      <CheckPill label={types[job.job_type] || job.job_type} />
      {!!job.category && <Pill label={job.category} color={C.grey} text={C.muted} />}
    </View>
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      {job.is_featured && <Pill label="Featured" {...featured} />}
      {pill && <Pill {...pill} />}
      {isClosed(job) && <Pill label="Closed" {...closed} />}
      <Text style={s.small}>{posted(job.created_at)}</Text>
      {closes && <Text style={s.small}>{closes}</Text>}
    </View>
  </Pressable>
}, sameCard)

/** Owns the typed text so a keystroke re-renders this bar and not the list. */
function SearchBar({ onSearch, onClear }: { onSearch: (term: string) => void; onClear: () => void }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  function submit() { Keyboard.dismiss(); onSearch(text.trim()) }
  return <View style={[s.input, s.row, { paddingVertical: 0, paddingHorizontal: 12, gap: 8, minHeight: 48 }, focused && { borderColor: C.teal }]}>
    <Press accessibilityLabel="Search" onPress={submit} style={{ padding: 6 }}><Icon name="search" size={20} color={C.muted} /></Press>
    <TextInput accessibilityLabel="Search jobs" value={text} onChangeText={setText} placeholder="Role, company or keyword" placeholderTextColor={C.muted} returnKeyType="search" onSubmitEditing={submit}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: C.ink }} />
    {!!text && <Press accessibilityLabel="Clear search" onPress={() => { setText(''); onClear() }} style={{ padding: 6 }}><Icon name="close-circle" size={20} color={C.muted} /></Press>}
  </View>
}

/** replace: search or filter changed. pull: user pull. more: next page. silent: background refresh of what's on screen. */
type LoadMode = 'replace' | 'pull' | 'more' | 'silent'

export const JobsScreen = memo(function JobsScreen({ open, active, top, home }: { open: (job: Job) => void; active: boolean; top: number; home: number }) {
  const [resetSearch, setResetSearch] = useState(0)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState<LoadMode | ''>('replace')
  const [error, setError] = useState('')
  const [moreError, setMoreError] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  const list = useRef<FlatList<Job>>(null)
  async function load(mode: LoadMode = 'replace') {
    const version = ++generation.current
    const start = mode === 'more' ? page + 1 : 0
    const pages = mode === 'silent' ? page + 1 : 1 // Silent keeps every loaded page so the scroll position holds.
    inFlight.current = true
    setLoading(mode)
    if (mode !== 'silent') { setError(''); setMoreError('') }
    try {
      const result = await getJobs(query, type, start, pages)
      if (version !== generation.current) return
      setJobs(old => {
        if (!start) return result.jobs
        // Offset pages can repeat a job when a new one is posted between pages.
        const seen = new Set(old.map(j => j.id))
        return [...old, ...result.jobs.filter(j => !seen.has(j.id))]
      })
      setCount(result.count); setError('')
      if (mode !== 'silent') setPage(start)
      const end = start + pages
      setHasMore(result.jobs.length === pages * PAGE_SIZE && end * PAGE_SIZE < result.count)
      if (mode === 'replace') list.current?.scrollToOffset({ offset: 0, animated: false })
    } catch (e) {
      if (version !== generation.current) return
      const message = (e as Error).message
      if (mode === 'more') setMoreError(message)
      else if (mode === 'pull') setError(message)
      else if (mode === 'replace') {
        // These results belong to the previous search, so don't leave them under the new one.
        setError(message); setJobs([]); setCount(0); setHasMore(false)
      }
    } finally {
      if (version === generation.current) { inFlight.current = false; setLoading('') }
    }
  }
  useEffect(() => { void load(); return () => { generation.current++ } }, [query, type])
  // Logo tap: clear any search or filter and return to the top of the full list.
  useEffect(() => {
    if (!home) return
    setResetSearch(v => v + 1); setQuery(''); setType('')
    list.current?.scrollToOffset({ offset: 0, animated: true })
  }, [home])
  useStaleRefresh(active, () => { if (!inFlight.current) void load('silent') })
  useEffect(() => { if (active && top) list.current?.scrollToOffset({ offset: 0, animated: true }) }, [top])
  const renderJob = useCallback(({ item }: { item: Job }) => <JobCard job={item} open={open} />, [open])
  function search(term: string) {
    if (term === query) void load() // Same term: retry rather than do nothing.
    else setQuery(term)
  }
  function clearFilters() { Keyboard.dismiss(); setResetSearch(v => v + 1); setQuery(''); setType('') }
  return <View style={{ flex: 1 }}>
    <View style={{ gap: 8, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ paddingHorizontal: 16 }}><SearchBar key={resetSearch} onSearch={search} onClear={() => setQuery('')} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {[['', 'All jobs'], ...Object.entries(types)].map(([value, label]) => <Press key={value} accessibilityState={{ selected: value === type }} onPress={() => setType(value)} style={[s.pill, { paddingVertical: 12, overflow: 'hidden' }, value === type && { backgroundColor: C.teal }]}><Text style={[s.pillText, value === type && { color: C.white }]}>{label}</Text></Press>)}
      </ScrollView>
    </View>
    <FlatList ref={list} data={jobs} keyExtractor={j => j.id} renderItem={renderJob}
      style={loading === 'replace' && jobs.length ? { opacity: .5 } : undefined}
      contentContainerStyle={s.list} ItemSeparatorComponent={CardGap}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      initialNumToRender={6} maxToRenderPerBatch={5} windowSize={7} removeClippedSubviews
      refreshing={loading === 'pull'} onRefresh={() => load('pull')}
      onEndReachedThreshold={.5} onEndReached={() => { if (active && !inFlight.current && hasMore && !moreError && !error) void load('more') }}
      ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>
        <Text style={s.h1}>Good work. Closer to home.</Text>
        <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.label}>{loading === 'replace' || loading === 'pull' ? 'Finding opportunities…' : `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`}</Text>
          {(query || type) && <Press onPress={clearFilters}><Text style={{ color: C.bright, fontSize: 13, fontWeight: '600' }}>Clear filters</Text></Press>}</View>
        {!!error && !!jobs.length && <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button secondary title="Try again" onPress={() => load()} /></>}
      </View>}
      ListEmptyComponent={loading === 'replace' ? <Skeletons />
        : error ? <Empty icon="cloud-offline-outline" title="We couldn't load jobs" body={error}><Button title="Try again" onPress={() => load()} /></Empty>
        : !loading ? <Empty icon="search-outline" title={query ? `No jobs match “${query}”` : 'No matches yet'} body="Try another keyword or job type. New opportunities will appear here as employers post them.">
          {!!(query || type) && <Button secondary title="Clear filters" onPress={clearFilters} />}
        </Empty> : null}
      ListFooterComponent={loading === 'more' ? <ActivityIndicator color={C.teal} style={{ paddingVertical: 16 }} />
        : moreError ? <View style={{ gap: 12, paddingTop: 16 }}><Text accessibilityRole="alert" style={s.error}>{moreError}</Text><Button secondary title="Try again" onPress={() => load('more')} /></View>
        : null}
    />
  </View>
})

function Fact({ icon, text }: { icon: Parameters<typeof Icon>[0]['name']; text: string }) {
  return <View style={[s.row, { gap: 8, alignItems: 'flex-start' }]}><Icon name={icon} size={20} /><Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: C.ink }}>{text}</Text></View>
}

export function JobDetail({ job, close, signIn, viewApplications, onChanged }: { job: Job | null; close: () => void; signIn: () => void; viewApplications: () => void; onChanged: () => void }) {
  const { session, account, error: accountError, refresh } = useAccount()
  const marks = useMarks()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<'view' | 'apply' | 'sent'>('view')
  const [letter, setLetter] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  // The last job stays on screen so the modal has content to slide out with.
  const openJob = useRef(job)
  openJob.current = job
  const lastJob = useRef(job)
  if (job) lastJob.current = job
  const shown = lastJob.current
  useEffect(() => { if (job) { setStep('view'); setLetter(''); setError('') } }, [job])
  if (!shown) return null
  const company = shown.company?.company_name || 'Employer'
  const saved = marks.saved.has(shown.id)
  const applied = marks.applied.has(shown.id)
  const ended = isClosed(shown)
  // Until we know what this seeker has done, a tap could undo a save or re-apply.
  const known = !session || marks.status === 'ready'
  const lookupFailed = !!session && (marks.status === 'error' || (!account && !!accountError))
  function goSignIn() { close(); signIn() }
  async function save() {
    const id = shown!.id
    setBusy('save'); setError('')
    try {
      const result = await api<{ saved?: boolean }>('jobs/save', { job_id: id, saved: !saved })
      marks.markSaved(id, !!result.saved)
      toast(result.saved ? 'Saved for later' : 'Removed from saved')
      onChanged()
    } catch (e) { if (openJob.current?.id === id) setError((e as Error).message) }
    finally { setBusy('') }
  }
  async function apply() {
    const id = shown!.id
    Keyboard.dismiss()
    setBusy('apply'); setError('')
    const sent = () => { marks.markApplied(id); onChanged(); if (openJob.current?.id === id) setStep('sent') }
    try {
      await api('jobs/apply', { job_id: id, cover_letter_text: letter.trim() }, SLOW_TIMEOUT)
      sent()
    } catch (e) {
      // 409 means it's already in, for example a timed-out attempt that reached the server.
      if ((e as { status?: number }).status === 409) sent()
      else if (openJob.current?.id === id) setError((e as Error).message)
    } finally { setBusy('') }
  }
  const header = <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'space-between' }]}>
    {step === 'apply' ? <Press accessibilityLabel="Back to job details" onPress={() => { setStep('view'); setError('') }} style={{ padding: 11 }}><Icon name="arrow-back" /></Press>
      : <Press accessibilityLabel="Close job details" onPress={close} style={{ padding: 11 }}><Icon name="close" /></Press>}
    <Press accessibilityLabel="Share job" style={{ padding: 11 }} onPress={() => Share.share({ message: `${shown.title} at ${shown.company?.company_name || 'JobLinks'} — ${SITE}/jobs/${shown.id}`, url: `${SITE}/jobs/${shown.id}` }).catch(() => setError('Could not open sharing.'))}><Icon name="share-outline" /></Press>
  </View>
  const errorBox = !!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>
  return <Modal visible={!!job} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (step === 'apply') setStep('view'); else close() }}>
    <SafeAreaView style={s.screen} edges={['top']}>{header}
      {step === 'sent' ? <View style={{ flex: 1, justifyContent: 'center', paddingBottom: insets.bottom }}>
        <Empty icon="checkmark-circle-outline" title="Application sent." body={`${company} can now review your profile. You can track its progress in Applications.`}>
          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <Button title="View my applications" onPress={() => { close(); viewApplications() }} />
            <Button secondary title="Keep browsing" onPress={close} />
          </View>
        </Empty>
      </View> : step === 'apply' ? <KeyboardArea>
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={{ gap: 4 }}><Text style={s.h2}>{shown.title}</Text><Text style={s.small}>{company}</Text></View>
          <Field label="Introduce yourself (optional)" multiline maxLength={5000} value={letter} onChangeText={setLetter} placeholder="Tell the employer why this role interests you." />
          <Text style={s.small}>Your profile and introduction will be shared with the employer or JobLinks hiring team.</Text>
          {errorBox}
          <Button title="Send application" busy={busy === 'apply'} disabled={!!busy} onPress={apply} />
        </ScrollView>
      </KeyboardArea> : <>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
          <View style={s.row}><Logo key={shown.id} company={shown.company} /><View style={{ flex: 1 }}><Text style={s.label}>{company}</Text><Text style={s.small}>{posted(shown.created_at)}</Text></View>{ended && <Pill label="Closed" {...closed} />}</View>
          <Text style={s.h1}>{shown.title}</Text>
          <View style={[s.card, { gap: 8 }]}>
            <Fact icon="location-outline" text={shown.location} />
            <Fact icon="briefcase-outline" text={types[shown.job_type] || shown.job_type} />
            <Fact icon="cash-outline" text={salary(shown)} />
            {!!shown.expires_at && <Fact icon="calendar-outline" text={`Closing date: ${new Date(shown.expires_at).toLocaleDateString(undefined, { timeZone: 'UTC' })}`} />}
          </View>
          <Text style={s.h2}>About the role</Text><Text selectable style={[s.body, { color: C.ink }]}>{shown.description}</Text>
        </ScrollView>
        <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + insets.bottom, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line }}>
          {errorBox}
          {lookupFailed && <View style={[s.row, { justifyContent: 'space-between' }]}><Text accessibilityRole="alert" style={[s.small, { flex: 1, color: C.red }]}>Could not check your saved jobs and applications.</Text>
            <Press onPress={() => { void (account ? marks.reload() : refresh()) }}><Text style={{ color: C.bright, fontWeight: '600' }}>Try again</Text></Press></View>}
          <View style={s.row}>
            <View style={{ flex: 1 }}>{ended && !applied ? <Text style={[s.label, { textAlign: 'center' }]}>This job is no longer accepting applications.</Text>
              : <Button title={applied ? 'Application submitted' : session ? 'Apply' : 'Sign in to apply'} disabled={applied || !known} onPress={() => { if (session) { setError(''); setStep('apply') } else goSignIn() }} />}</View>
            <Press accessibilityLabel={saved ? 'Remove from saved jobs' : 'Save for later'} accessibilityState={{ selected: saved, disabled: !!busy || !known }} disabled={!!busy || !known} onPress={() => { if (session) void save(); else goSignIn() }}
              style={[s.button, s.secondary, { width: 52, padding: 0, overflow: 'hidden' }, (!!busy || !known) && { opacity: .65 }]}>
              {busy === 'save' ? <ActivityIndicator color={C.teal} /> : <Icon name={saved ? 'bookmark' : 'bookmark-outline'} />}
            </Press>
          </View>
        </View>
      </>}
      <ToastHost bottom={88 + insets.bottom} />
    </SafeAreaView>
  </Modal>
}
