import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Linking, ScrollView, Switch, Text, View, type TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { api, db, friendly, OFFLINE_MESSAGE, SITE, SLOW_TIMEOUT, TIMEOUT_MESSAGE } from './client'
import { useAccount, useMarks } from './Auth'
import { fields, type Job } from './jobs'
import { JobCard } from './JobScreens'
import { Button, C, CardGap, Empty, Field, Group, HEADER_HEIGHT, Icon, KeyboardArea, Press, Row, s, Skeletons, useStaleRefresh, useToast } from './ui'
import * as push from './notifications'
import { signInWithGoogle } from './oauth'

export async function website(path: string) {
  try { await WebBrowser.openBrowserAsync(`${SITE}${path}`, { toolbarColor: C.bg, controlsColor: C.teal }) }
  catch { Alert.alert('Could not open the website', 'Please try again.') }
}
function signInMessage(e: Error & { code?: string }) {
  if (e.message === TIMEOUT_MESSAGE) return TIMEOUT_MESSAGE
  if (e.code === 'invalid_credentials' || /invalid login/i.test(e.message)) return "That email and password don't match. Please try again."
  if (e.code === 'email_not_confirmed' || /not confirmed/i.test(e.message)) return 'Please verify your email first, then sign in again.'
  if (/rate limit|too many/i.test(e.message)) return 'Too many attempts. Please wait a moment and try again.'
  if (e.name === 'AuthRetryableFetchError' || /network|fetch|connection/i.test(e.message)) return OFFLINE_MESSAGE
  return 'Could not sign you in. Please try again.'
}
function googleMessage(e: Error) {
  if (e.message === TIMEOUT_MESSAGE) return TIMEOUT_MESSAGE
  if (/network|fetch|connection/i.test(e.message)) return OFFLINE_MESSAGE
  return 'Could not sign you in with Google. Please try again.'
}
type LibraryItem = { id: string; job: Job; status?: string }
export const LibraryScreen = memo(function LibraryScreen({ mode, open, signIn, browse, revision, active, top }: { mode: 'saved' | 'applications'; open: (job: Job) => void; signIn: () => void; browse: () => void; revision: number; active: boolean; top: number }) {
  const { session, account, loading, error: accountError, refresh } = useAccount()
  const marks = useMarks()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [busy, setBusy] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const list = useRef<FlatList<LibraryItem>>(null)
  useStaleRefresh(active, () => setReload(x => x + 1))
  useEffect(() => { if (active && top) list.current?.scrollToOffset({ offset: 0, animated: true }) }, [top])
  const renderItem = useCallback(({ item }: { item: LibraryItem }) => <JobCard job={item.job} open={open} status={item.status} />, [open])
  useEffect(() => {
    let live = true
    setError('')
    if (!session || account?.role !== 'seeker') { setItems([]); setBusy(false); setPulling(false); return }
    setBusy(true)
    void (async () => {
      try {
        const profile = await db.from('seeker_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
        if (profile.error) throw new Error(friendly(profile.error.message, 'Could not load your profile.'))
        if (!profile.data) { if (live) setItems([]); return }
        const result = mode === 'saved'
          ? await db.from('saved_jobs').select(`id,job:job_listings(${fields})`).eq('seeker_id', profile.data.id).order('created_at', { ascending: false }).limit(100)
          : await db.from('applications').select(`id,status,job:job_listings(${fields})`).eq('seeker_id', profile.data.id).order('applied_at', { ascending: false }).limit(100)
        if (result.error) throw new Error(friendly(result.error.message, 'Could not load your list. Please try again.'))
        if (live) setItems((result.data as unknown as LibraryItem[]).filter(item => item.job))
      } catch (e) { if (live) setError((e as Error).message) }
      finally { if (live) { setBusy(false); setPulling(false) } }
    })()
    return () => { live = false }
  }, [mode, session?.user.id, account?.role, revision, reload])
  const saved = mode === 'saved'
  const title = saved ? 'Your shortlist.' : 'Your next steps.'
  const icon = saved ? 'bookmark-outline' : 'paper-plane-outline'
  if (loading) return <View style={s.list}><Skeletons /></View>
  if (!session) return <Empty icon={icon} title={title} body="Sign in with your JobLinks account to keep your hiring journey in one place."><Button title="Sign in" onPress={signIn} /></Empty>
  if (account?.role === 'employer') return <Empty title="Your employer workspace" body="Review your vacancies and manage hiring from the Profile tab." />
  if (!account && accountError) return <Empty icon="cloud-offline-outline" title="We couldn't check your account" body={accountError}><Button title="Try again" onPress={() => { void refresh() }} /></Empty>
  const waiting = busy || !account
  const needsProfile = !saved && marks.status === 'ready' && !marks.profileId
  return <FlatList ref={list} data={items} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={s.list} ItemSeparatorComponent={CardGap}
    refreshing={pulling} onRefresh={() => { setPulling(true); setReload(x => x + 1) }}
    ListHeaderComponent={<View style={{ gap: 8, marginBottom: 16 }}><Text style={s.eyebrow}>{saved ? 'SAVED JOBS' : 'APPLICATIONS'}</Text><Text style={s.h1}>{title}</Text>
      <Text style={s.body}>{saved ? 'The opportunities you want to come back to.' : 'Track the latest status shared by each employer.'}</Text>
      {!!error && !!items.length && <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button secondary title="Try again" onPress={() => setReload(x => x + 1)} /></>}</View>}
    ListEmptyComponent={waiting ? <Skeletons />
      : error ? <Empty icon="cloud-offline-outline" title="We couldn't load your list" body={error}><Button title="Try again" onPress={() => setReload(x => x + 1)} /></Empty>
      : saved ? <Empty icon={icon} title="Start your shortlist" body="Save a job from its details screen and it will appear here."><Button title="Browse jobs" onPress={browse} /></Empty>
      : <Empty icon={icon} title="Your first step starts here" body={needsProfile ? 'Complete your profile, then apply for a role from Find jobs.' : 'Apply for a role from Find jobs and track it here.'}>
        <View style={{ alignSelf: 'stretch', gap: 12 }}><Button title="Find jobs" onPress={browse} />{needsProfile && <Button secondary title="Complete your profile" onPress={signIn} />}</View>
      </Empty>}
    ListFooterComponent={items.length >= 100 ? <View style={{ paddingTop: 16 }}><Button secondary title="See full history on the website" onPress={() => website(saved ? '/saved' : '/applications')} /></View> : null}
  />
})

type Visibility = 'actively_looking' | 'open' | 'not_looking'
type Profile = { id?: string; first_name: string; last_name: string; phone: string; location: string; bio: string; skills: string[]; experience_years: number | null; education: string; cv_url: string | null; avatar_url: string | null; visibility: Visibility }
const blank: Profile = { first_name: '', last_name: '', phone: '', location: '', bio: '', skills: [], experience_years: null, education: '', cv_url: null, avatar_url: null, visibility: 'actively_looking' }
const VISIBILITY_PILL: Record<Visibility, { label: string; icon: 'eye' | 'eye-off'; tone: 'green' | 'teal' | 'muted' }> = {
  actively_looking: { label: 'Employers can find you', icon: 'eye', tone: 'green' },
  open: { label: 'Open to opportunities', icon: 'eye', tone: 'teal' },
  not_looking: { label: 'Hidden from employers', icon: 'eye-off', tone: 'muted' },
}
const VISIBILITY_CHOICES: { value: Visibility; label: string; description: string }[] = [
  { value: 'actively_looking', label: 'Actively looking', description: 'Your profile is visible to all employers' },
  { value: 'open', label: 'Open to opportunities', description: 'Your profile is visible to employers' },
  { value: 'not_looking', label: 'Not looking', description: 'Your profile is hidden, but you can still browse and apply' },
]
/** Mirrors the website's profile completion fields (src/lib/profile-completion.ts). */
function missingDetails(p: Profile, hasBuiltResume: boolean): string[] {
  const missing: string[] = []
  if (!p.first_name.trim()) missing.push('First name')
  if (!p.last_name.trim()) missing.push('Last name')
  if (!p.phone.trim()) missing.push('Phone number')
  if (!p.bio.trim()) missing.push('Bio')
  if (!p.skills.length) missing.push('At least one skill')
  if (!(typeof p.experience_years === 'number' && p.experience_years >= 0)) missing.push('Years of experience')
  if (!p.education.trim()) missing.push('Education')
  if (!p.cv_url && !hasBuiltResume) missing.push('Resume (uploaded or built)')
  return missing
}
const parseSkills = (text: string): string[] => text.split(',').map(x => x.trim()).filter(Boolean)
const CV_MIME_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
const contact = () => { void Linking.openURL('mailto:jujulaville8@gmail.com?subject=JobLinks%20app%20support').catch(() => Alert.alert('Contact JobLinks', 'Email jujulaville8@gmail.com')) }
function InfoRows() {
  return <Group>
    <Row icon="shield-checkmark-outline" label="Privacy policy" external onPress={() => website('/privacy')} />
    <Row icon="document-text-outline" label="Terms of use" external onPress={() => website('/terms')} />
    <Row icon="mail-outline" label="Contact JobLinks" onPress={contact} />
  </Group>
}
export const AccountScreen = memo(function AccountScreen({ active, top }: { active: boolean; top: number }) {
  const { session, account, loading, error: accountError, refresh } = useAccount()
  const marks = useMarks()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const scroller = useRef<ScrollView>(null)
  useEffect(() => { if (active && top) scroller.current?.scrollTo({ y: 0, animated: true }) }, [top])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile>(blank)
  const [profileReady, setProfileReady] = useState(false)
  const [skillsText, setSkillsText] = useState('')
  const [hasBuiltResume, setHasBuiltResume] = useState(false)
  const [essentialsOnly, setEssentialsOnly] = useState(false)
  const [section, setSection] = useState<'resume' | 'preferences'>('resume')
  const sectionInit = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [visOpen, setVisOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [cvBusy, setCvBusy] = useState(false)
  const [listings, setListings] = useState<{ id: string; title: string; status: string }[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [alertsOn, setAlertsOn] = useState(false)
  const [alertsBusy, setAlertsBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const passwordInput = useRef<TextInput>(null)
  useEffect(() => {
    let live = true
    setProfile(blank); setSkillsText(''); setProfileReady(false); setListings([]); setError(''); setLoadFailed(false)
    setConfirmingDelete(false); setDeleteText(''); setDeleteError('')
    setHasBuiltResume(false); setEssentialsOnly(false); setMenuOpen(false); setVisOpen(false); sectionInit.current = false
    if (!session || !account) return
    void (async () => {
      if (account.role === 'employer') {
        const company = await db.from('companies').select('id').eq('user_id', session.user.id).maybeSingle()
        if (company.error) throw new Error(friendly(company.error.message, 'Could not load your company.'))
        if (!company.data) return
        const result = await db.from('job_listings').select('id,title,status').eq('company_id', company.data.id).order('created_at', { ascending: false }).limit(50)
        if (result.error) throw new Error(friendly(result.error.message, 'Could not load your listings.'))
        if (live) setListings(result.data)
      } else {
        const result = await db.from('seeker_profiles').select('id,first_name,last_name,phone,location,bio,skills,experience_years,education,cv_url,avatar_url,visibility').eq('user_id', session.user.id).maybeSingle()
        if (result.error) throw new Error(friendly(result.error.message, 'Could not load your profile. Please try again.'))
        const built = await db.from('cv_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
        if (live && !built.error && built.data) setHasBuiltResume(true)
        if (!result.data) {
          // No seeker profile: an account that runs a company gets the plain
          // account essentials instead of the seeker hub.
          const company = await db.from('companies').select('id').eq('user_id', session.user.id).maybeSingle()
          if (live && !company.error && company.data) { setEssentialsOnly(true); setProfileReady(true) }
          else if (live) { setProfile(blank); setSkillsText(''); setProfileReady(true) }
          return
        }
        if (live) { const loaded = { ...blank, ...result.data }; setProfile(loaded); setSkillsText(loaded.skills.join(', ')); setProfileReady(true) }
      }
    })().catch(e => { if (live) { setError(e.message); setLoadFailed(true) } })
    return () => { live = false }
  }, [session?.user.id, account?.role, reload])
  // A brand new seeker lands on the form; an existing profile opens on Resume.
  useEffect(() => {
    if (profileReady && !sectionInit.current) { sectionInit.current = true; setSection(profile.id ? 'resume' : 'preferences') }
  }, [profileReady, profile.id])
  async function signIn() {
    if (busy || googleBusy || !email.trim() || !password) return
    setBusy(true); setError('')
    try {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      setPassword('')
    } catch (e) { setError(signInMessage(e as Error)) }
    finally { setBusy(false) }
  }
  async function google() {
    if (busy || googleBusy) return
    setGoogleBusy(true); setError('')
    try {
      const result = await signInWithGoogle()
      if (result.cancelled) return
    } catch (e) { setError(googleMessage(e as Error)) }
    finally { setGoogleBusy(false) }
  }
  /** The profile API scores completion from the fields it receives, so every save sends the full profile. */
  async function persist(next: Profile, message = 'Profile saved') {
    setBusy(true); setError('')
    try {
      const result = await api<{ profile_id: string }>('profile', { ...next, profile_id: next.id, first_name: next.first_name.trim(), last_name: next.last_name.trim() })
      const saved = { ...next, id: result.profile_id }
      setProfile(saved)
      setSkillsText(saved.skills.join(', '))
      if (!marks.profileId) void marks.reload() // A first profile unlocks saving and applying.
      toast(message)
      return true
    } catch (e) { setError((e as Error).message); return false }
    finally { setBusy(false) }
  }
  async function saveProfile() {
    await persist({ ...profile, skills: parseSkills(skillsText) })
  }
  async function chooseVisibility(next: Visibility) {
    setVisOpen(false)
    if (next === profile.visibility || busy) return
    await persist({ ...profile, skills: parseSkills(skillsText), visibility: next }, 'Visibility updated')
  }
  async function pickAvatar() {
    if (avatarBusy || !session) return
    setError('')
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) { Alert.alert('Photo access needed', 'Allow photo access in your phone settings to set a profile photo, or manage your photo on the JobLinks website.'); return }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) { setError('Image must be less than 2 MB.'); return }
    setAvatarBusy(true)
    try {
      const bytes = await (await fetch(asset.uri)).arrayBuffer()
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('Image must be less than 2 MB.')
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`
      // Same own-prefix avatars flow the website uses, with the user's own session.
      const uploaded = await db.storage.from('avatars').upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true })
      if (uploaded.error) throw new Error(friendly(uploaded.error.message, 'Could not upload your photo. Please try again.'))
      const { data: { publicUrl } } = db.storage.from('avatars').getPublicUrl(path)
      await persist({ ...profile, skills: parseSkills(skillsText), avatar_url: publicUrl }, 'Photo updated')
    } catch (e) { setError((e as Error).message) }
    finally { setAvatarBusy(false) }
  }
  async function pickCv() {
    if (cvBusy || !session) return
    setError('')
    let picked: DocumentPicker.DocumentPickerResult
    try { picked = await DocumentPicker.getDocumentAsync({ type: CV_MIME_TYPES, copyToCacheDirectory: true }) }
    catch { setError('Could not open the file picker. Please try again.'); return }
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    setCvBusy(true)
    try {
      const bytes = await (await fetch(asset.uri)).arrayBuffer()
      // The server validates the file and mints the canonical CV path, as on the website.
      const grant = await api<{ path: string; signedUrl: string; contentType: string }>('cv-upload', { name: asset.name, size: asset.size ?? bytes.byteLength, type: asset.mimeType ?? '' })
      const token = new URL(grant.signedUrl).searchParams.get('token')
      if (!token) throw new Error('Could not authorize your CV upload. Please try again.')
      const uploaded = await db.storage.from('cvs').uploadToSignedUrl(grant.path, token, bytes, { contentType: grant.contentType })
      if (uploaded.error) throw new Error(friendly(uploaded.error.message, 'Your CV upload failed. Please try again.'))
      await persist({ ...profile, skills: parseSkills(skillsText), cv_url: grant.path }, 'CV uploaded')
    } catch (e) { setError((e as Error).message) }
    finally { setCvBusy(false) }
  }
  async function viewCv() {
    if (!profile.cv_url) return
    setError('')
    try {
      if (/^https?:\/\//i.test(profile.cv_url)) { await WebBrowser.openBrowserAsync(profile.cv_url, { toolbarColor: C.bg, controlsColor: C.teal }); return }
      const { data, error: signError } = await db.storage.from('cvs').createSignedUrl(profile.cv_url, 3600)
      if (signError || !data?.signedUrl) throw new Error('Could not open your CV. Please try again.')
      await WebBrowser.openBrowserAsync(data.signedUrl, { toolbarColor: C.bg, controlsColor: C.teal })
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => {
    if (!active || !session) return
    if (!push.PUSH_ENABLED) return
    let live = true
    void push.getAlertsOn(session.user.id).then(on => { if (live) setAlertsOn(on) }).catch(() => {})
    return () => { live = false }
  }, [active, session?.user.id])
  async function toggleAlerts(next: boolean) {
    if (!session || alertsBusy) return
    setAlertsBusy(true)
    const problem = await push.setAlertsEnabled(session.user.id, next)
    setAlertsBusy(false)
    if (next) {
      if (!problem) { await push.setDecision('enabled'); setAlertsOn(true); toast('Job alerts are on') }
      else if (problem === 'denied') { setAlertsOn(false); toast('Notifications are turned off for JobLinks in your phone settings.') }
      else if (problem === 'unavailable') { setAlertsOn(false); toast('This device cannot receive job alerts.') }
      else toast('Could not turn on job alerts. Please try again.')
    } else if (problem) toast('Could not turn off job alerts. Please try again.')
    else { setAlertsOn(false); toast('Job alerts turned off.') }
  }
  async function signOut() {
    setSigningOut(true); setError('')
    // Stop pushes to this device while the session can still update its own row.
    await push.disableCurrentDevice()
    const { error } = await db.auth.signOut()
    setSigningOut(false)
    if (error) setError(friendly(error.message, 'Could not sign you out. Please try again.'))
  }
  async function deleteAccount() {
    setDeleting(true); setDeleteError('')
    try {
      await api('account/delete', {}, SLOW_TIMEOUT)
    } catch (e) {
      setDeleteError((e as Error).message); setDeleting(false)
      return
    }
    // The account is gone from here on, so a local sign-out failure is not a deletion failure.
    const { error } = await db.auth.signOut({ scope: 'local' })
    setDeleting(false)
    Alert.alert('Account deleted', error ? 'Your JobLinks account has been permanently deleted. Please close and reopen the app.' : 'Your JobLinks account has been permanently deleted.')
  }
  const isEmployer = account?.role === 'employer'
  const hub = !!session && !isEmployer && profileReady && !essentialsOnly
  const missing = missingDetails(profile, hasBuiltResume)
  const fullName = `${profile.first_name} ${profile.last_name}`.trim()
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
  const cvName = profile.cv_url ? decodeURIComponent(profile.cv_url.split('/').pop() || 'Your CV') : ''
  const pill = VISIBILITY_PILL[profile.visibility]
  const pillColor = pill.tone === 'green' ? C.green : pill.tone === 'teal' ? C.teal : C.muted
  const alertsBlock = push.PUSH_ENABLED ? <Group>
    <View style={[s.row, { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 }]}>
      <Icon name="notifications-outline" size={20} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: C.ink }}>Job alerts</Text>
        <Text style={s.small}>New job notifications</Text>
      </View>
      <Switch value={alertsOn} disabled={alertsBusy} onValueChange={toggleAlerts} trackColor={{ false: C.line, true: C.bright }} thumbColor={C.white} ios_backgroundColor={C.line} accessibilityLabel="Job alerts" />
    </View>
  </Group> : null
  const deleteBlock = !confirmingDelete
    ? (isEmployer || essentialsOnly) ? <Press onPress={() => setConfirmingDelete(true)} style={{ alignSelf: 'center', paddingVertical: 8 }}><Text style={{ color: C.red, fontSize: 16 }}>Delete account</Text></Press> : null
    : <View style={s.card}>
      <Text style={s.h2}>Delete your account?</Text>
      <Text style={s.body}>{isEmployer
        ? 'This permanently deletes your account, company, vacancies, and the applications and messages attached to them. This cannot be undone.'
        : 'This permanently deletes your account, profile, CV, applications, saved jobs, and messages. This cannot be undone.'}</Text>
      <Field label="Type DELETE to confirm" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
      {!!deleteError && <Text accessibilityRole="alert" style={s.error}>{deleteError}</Text>}
      <Button danger title="Permanently delete my account" busy={deleting} disabled={deleteText.trim() !== 'DELETE'} onPress={deleteAccount} />
      <Button secondary title="Keep my account" disabled={deleting} onPress={() => { setConfirmingDelete(false); setDeleteText(''); setDeleteError('') }} />
    </View>
  return <KeyboardArea offset={insets.top + HEADER_HEIGHT}><ScrollView ref={scroller} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    {hub ? <View style={[s.row, { justifyContent: 'space-between' }]}>
      <Text style={s.h1}>Profile</Text>
      <Press accessibilityRole="button" accessibilityLabel="Profile menu" onPress={() => setMenuOpen(o => !o)} style={{ padding: 8 }}><Icon name="menu" size={26} color={C.ink} /></Press>
    </View> : <>
      <Text style={s.eyebrow}>YOUR JOBLINKS</Text><Text style={s.h1}>{session ? isEmployer ? 'Your hiring hub.' : 'Make it yours.' : 'Welcome to JobLinks.'}</Text>
    </>}
    {hub && menuOpen && <Group>
      <Row icon="chatbubbles-outline" label="Messages" external onPress={() => { setMenuOpen(false); website('/messages') }} />
      <Row icon="shield-checkmark-outline" label="Privacy policy" external onPress={() => { setMenuOpen(false); website('/privacy') }} />
      <Row icon="document-text-outline" label="Terms of use" external onPress={() => { setMenuOpen(false); website('/terms') }} />
      <Row icon="mail-outline" label="Contact JobLinks" onPress={() => { setMenuOpen(false); contact() }} />
      <Row icon="log-out-outline" label="Sign out" plain busy={signingOut} onPress={() => { setMenuOpen(false); void signOut() }} />
      <Row icon="trash-outline" label="Delete account" plain onPress={() => { setMenuOpen(false); setConfirmingDelete(true); setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60) }} />
    </Group>}
    {loading && <ActivityIndicator color={C.teal} />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {loadFailed && <Button secondary title="Try again" onPress={() => setReload(x => x + 1)} />}
    {!!accountError && <><Text accessibilityRole="alert" style={s.error}>{accountError}</Text><Button secondary title="Check account again" onPress={() => { void refresh() }} /></>}
    {loading ? null : !session ? <>
      <Image source={require('../assets/joblink-mark.png')} style={{ alignSelf: 'center', width: 76, height: 95, marginTop: 8 }} resizeMode="contain" accessibilityLabel="JobLinks" />
      <Text style={s.body}>Your existing JobLinks account works here too.</Text>
      <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
      <Field label="Password" inputRef={passwordInput} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={signIn} />
      <Button title="Sign in" busy={busy} disabled={!email.trim() || !password || googleBusy} onPress={signIn} />
      <View style={s.row}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        <Text style={{ color: C.muted, fontSize: 13 }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      </View>
      <Press accessibilityRole="button" disabled={busy || googleBusy} onPress={google} style={[s.button, { backgroundColor: C.white, borderWidth: 1, borderColor: C.line }]}>
        {googleBusy ? <ActivityIndicator color={C.teal} /> : <View style={[s.row, { gap: 8 }]}>
          <Text style={{ color: '#4285F4', fontWeight: '800', fontSize: 17 }}>G</Text>
          <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>Continue with Google</Text>
        </View>}
      </Press>
      <Press accessibilityRole="link" onPress={() => website('/forgot-password')} style={{ alignSelf: 'center', paddingVertical: 4 }}><Text style={{ color: C.bright, fontSize: 16 }}>Forgot your password?</Text></Press>
      <Button secondary title="Create an account on JobLinks" onPress={() => website('/signup')} />
      <Text style={s.small}>Account creation and password recovery open the secure JobLinks website. After verifying your email, return here to sign in.</Text>
      <InfoRows />
    </> : isEmployer ? <>
      <Text style={s.body}>{session.user.email}</Text>
      <Text style={s.body}>Your vacancies, connected to the same employer account you use on the website.</Text>
      {listings.map(item => <View key={item.id} style={s.card}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.pillText}>{item.status.replaceAll('_', ' ')}</Text></View>)}
      <Button title="Manage vacancies and applicants" onPress={() => website('/my-listings')} />
      <Text style={s.small}>Hiring tools open on the website. You may need to sign in there separately.</Text>
      <Group>
        <Row icon="megaphone-outline" label="Send us a vacancy" external onPress={() => website('/employers/hiring-help')} />
        <Row icon="chatbubbles-outline" label="Messages" external onPress={() => website('/messages')} />
      </Group>
      {alertsBlock}
      <InfoRows />
      <Group><Row icon="log-out-outline" label="Sign out" plain busy={signingOut} onPress={signOut} /></Group>
      {deleteBlock}
    </> : !profileReady ? (!accountError && !loadFailed ? <ActivityIndicator color={C.teal} /> : null) : essentialsOnly ? <>
      <Text style={s.body}>{session.user.email}</Text>
      <InfoRows />
      <Group><Row icon="log-out-outline" label="Sign out" plain busy={signingOut} onPress={signOut} /></Group>
      {deleteBlock}
    </> : <>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Press accessibilityRole="button" accessibilityLabel="Change your profile photo" disabled={avatarBusy} onPress={pickAvatar} style={{ width: 120, height: 120 }}>
          {profile.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={{ width: 120, height: 120, borderRadius: 60 }} accessibilityLabel="Your profile photo" />
            : <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: C.wash, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 40, fontWeight: '800', color: C.teal }}>{initials || '?'}</Text></View>}
          <View style={{ position: 'absolute', right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
            {avatarBusy ? <ActivityIndicator color={C.white} size="small" /> : <Icon name="camera" size={17} color={C.white} />}
          </View>
        </Press>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={s.h2}>{fullName || 'Your name'}</Text>
          <Press accessibilityRole="button" accessibilityLabel="Edit your details" onPress={() => setSection('preferences')} style={{ padding: 4 }}><Icon name="pencil" size={18} color={C.muted} /></Press>
        </View>
        {!!profile.location && <Text style={[s.body, { textAlign: 'center' }]}>{profile.location}</Text>}
        <Text style={[s.small, { textAlign: 'center', fontSize: 14 }]}>{[profile.phone, session.user.email].filter(Boolean).join('  ·  ')}</Text>
        <Press accessibilityRole="button" accessibilityLabel={`Profile visibility: ${pill.label}. Tap to change.`} accessibilityState={{ expanded: visOpen }} onPress={() => setVisOpen(o => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 30, borderWidth: 1, backgroundColor: pill.tone === 'green' ? C.greenWash : pill.tone === 'teal' ? C.wash : C.grey, borderColor: pill.tone === 'green' ? C.green : pill.tone === 'teal' ? C.bright : C.line }}>
          <Icon name={pill.icon} size={18} color={pillColor} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: pillColor }}>{pill.label}</Text>
          <Icon name="chevron-down" size={16} color={pillColor} />
        </Press>
        {visOpen && <View style={[s.card, { alignSelf: 'stretch', padding: 0, gap: 0, overflow: 'hidden' }]}>
          {VISIBILITY_CHOICES.map((choice, i) => <Press key={choice.value} accessibilityRole="button" accessibilityState={{ selected: profile.visibility === choice.value }} onPress={() => chooseVisibility(choice.value)}
            style={{ padding: 16, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={s.row}><Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{choice.label}</Text>{profile.visibility === choice.value && <Icon name="checkmark" size={18} />}</View>
            <Text style={s.small}>{choice.description}</Text>
          </Press>)}
        </View>}
      </View>
      <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: C.line, gap: 0 }]}>
        {(['resume', 'preferences'] as const).map(tab => <Press key={tab} accessibilityRole="tab" accessibilityState={{ selected: section === tab }} onPress={() => setSection(tab)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: section === tab ? 2 : 0, borderBottomColor: C.teal }}>
          <Text style={{ fontSize: 16, fontWeight: section === tab ? '700' : '500', color: section === tab ? C.ink : C.muted }}>{tab === 'resume' ? 'Resume' : 'Preferences'}</Text>
        </Press>)}
      </View>
      {section === 'resume' ? <>
        {hasBuiltResume && <View style={s.card}>
          <Text style={s.cardTitle}>JobLinks Resume</Text>
          <Text style={s.small}>Built with the JobLinks resume builder</Text>
          <Button secondary title="View on the website" onPress={() => website('/profile')} />
        </View>}
        <View style={s.card}>
          <Text style={s.cardTitle}>{profile.cv_url ? cvName : 'Your CV'}</Text>
          <Text style={s.small}>{profile.cv_url ? 'Employers receive this file with your applications.' : 'You have not added a CV yet. Add one so employers can see it.'}</Text>
          {profile.cv_url ? <>
            <Button secondary title="View CV" onPress={viewCv} />
            <Button secondary title="Replace CV" busy={cvBusy} onPress={pickCv} />
          </> : <Button title="Upload your CV" busy={cvBusy} onPress={pickCv} />}
          <Text style={s.small}>PDF, DOC, DOCX or an image, up to 10 MB.</Text>
        </View>
        {missing.length ? <Press accessibilityRole="button" accessibilityLabel={`${missing.length} missing ${missing.length === 1 ? 'detail' : 'details'}. Complete your profile.`} onPress={() => setSection('preferences')}
          style={[s.card, { backgroundColor: C.amberWash, borderColor: C.amber }]}>
          <View style={s.row}>
            <Icon name="alert-circle" size={20} color={C.amberText} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.amberText }}>{missing.length} missing {missing.length === 1 ? 'detail' : 'details'}</Text>
            <Icon name="chevron-forward" size={18} color={C.amberText} />
          </View>
          <Text style={{ fontSize: 14, color: C.amberText }}>Next: {missing[0]}</Text>
        </Press> : <View style={[s.card, { backgroundColor: C.greenWash, borderColor: C.green }]}>
          <View style={s.row}>
            <Icon name="checkmark-circle" size={20} color={C.green} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.green }}>Your profile is complete</Text>
          </View>
          <Text style={{ fontSize: 14, color: C.green }}>Employers see the full picture when you apply.</Text>
        </View>}
      </> : <>
        <Field label="First name" value={profile.first_name || ''} onChangeText={v => setProfile(p => ({ ...p, first_name: v }))} autoComplete="given-name" />
        <Field label="Last name" value={profile.last_name || ''} onChangeText={v => setProfile(p => ({ ...p, last_name: v }))} autoComplete="family-name" />
        <Field label="Phone" value={profile.phone || ''} onChangeText={v => setProfile(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
        <Field label="Location" value={profile.location || ''} onChangeText={v => setProfile(p => ({ ...p, location: v }))} placeholder="St. John's, Antigua" />
        <Field label="About you" value={profile.bio || ''} onChangeText={v => setProfile(p => ({ ...p, bio: v }))} multiline maxLength={2000} />
        <Field label="Skills" value={skillsText} onChangeText={setSkillsText} placeholder="Customer service, Cash handling, Driving" />
        <Text style={[s.small, { marginTop: -8 }]}>Separate your skills with commas.</Text>
        <Field label="Years of experience" value={profile.experience_years === null ? '' : String(profile.experience_years)} keyboardType="number-pad"
          onChangeText={v => { const n = parseInt(v, 10); setProfile(p => ({ ...p, experience_years: v.trim() === '' || Number.isNaN(n) ? null : Math.max(0, n) })) }} />
        <Field label="Education" value={profile.education || ''} onChangeText={v => setProfile(p => ({ ...p, education: v }))} placeholder="School or qualification" />
        <Button title="Save profile" busy={busy} disabled={!profile.first_name.trim() || !profile.last_name.trim()} onPress={saveProfile} />
        {alertsBlock}
      </>}
      {deleteBlock}
    </>}
    <Text style={[s.small, { textAlign: 'center' }]}>JobLinks · Made for Antigua & Barbuda</Text>
  </ScrollView></KeyboardArea>
})
