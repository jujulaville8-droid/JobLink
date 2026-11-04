import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Linking, ScrollView, Switch, Text, View, type TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
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
  if (account?.role === 'employer') return <Empty title="Your employer workspace" body="Review your vacancies and manage hiring from the Account tab." />
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

type Profile = { id?: string; first_name: string; last_name: string; phone: string; location: string; bio: string; skills: string[]; experience_years: number | null; education: string; cv_url: string | null }
const blank: Profile = { first_name: '', last_name: '', phone: '', location: '', bio: '', skills: [], experience_years: null, education: '', cv_url: null }
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
    setProfile(blank); setProfileReady(false); setListings([]); setError(''); setLoadFailed(false)
    setConfirmingDelete(false); setDeleteText(''); setDeleteError('')
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
        const result = await db.from('seeker_profiles').select('id,first_name,last_name,phone,location,bio,skills,experience_years,education,cv_url').eq('user_id', session.user.id).maybeSingle()
        if (result.error) throw new Error(friendly(result.error.message, 'Could not load your profile. Please try again.'))
        if (live) { setProfile(result.data ? { ...blank, ...result.data } : blank); setProfileReady(true) }
      }
    })().catch(e => { if (live) { setError(e.message); setLoadFailed(true) } })
    return () => { live = false }
  }, [session?.user.id, account?.role, reload])
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
  async function saveProfile() {
    setBusy(true); setError('')
    try {
      const result = await api<{ profile_id: string }>('profile', { ...profile, profile_id: profile.id, first_name: profile.first_name.trim(), last_name: profile.last_name.trim() })
      setProfile(p => ({ ...p, id: result.profile_id }))
      if (!marks.profileId) void marks.reload() // A first profile unlocks saving and applying.
      toast('Profile saved')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
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
  return <KeyboardArea offset={insets.top + HEADER_HEIGHT}><ScrollView ref={scroller} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Text style={s.eyebrow}>YOUR JOBLINKS</Text><Text style={s.h1}>{session ? account?.role === 'employer' ? 'Your hiring hub.' : 'Make it yours.' : 'Welcome to JobLinks.'}</Text>
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
    </> : <>
      <Text style={s.body}>{session.user.email}</Text>
      {account?.role === 'employer' ? <>
        <Text style={s.body}>Your vacancies, connected to the same employer account you use on the website.</Text>
        {listings.map(item => <View key={item.id} style={s.card}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.pillText}>{item.status.replaceAll('_', ' ')}</Text></View>)}
        <Button title="Manage vacancies and applicants" onPress={() => website('/my-listings')} />
        <Text style={s.small}>Hiring tools open on the website. You may need to sign in there separately.</Text>
        <Group>
          <Row icon="megaphone-outline" label="Send us a vacancy" external onPress={() => website('/employers/hiring-help')} />
          <Row icon="chatbubbles-outline" label="Messages" external onPress={() => website('/messages')} />
        </Group>
      </> : profileReady ? <>
        <Text style={s.h2}>Your candidate profile</Text>
        <Field label="First name" value={profile.first_name || ''} onChangeText={v => setProfile(p => ({ ...p, first_name: v }))} autoComplete="given-name" />
        <Field label="Last name" value={profile.last_name || ''} onChangeText={v => setProfile(p => ({ ...p, last_name: v }))} autoComplete="family-name" />
        <Field label="Phone" value={profile.phone || ''} onChangeText={v => setProfile(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
        <Field label="Location" value={profile.location || ''} onChangeText={v => setProfile(p => ({ ...p, location: v }))} placeholder="St. John's, Antigua" />
        <Field label="About you" value={profile.bio || ''} onChangeText={v => setProfile(p => ({ ...p, bio: v }))} multiline maxLength={2000} />
        <Button title="Save profile" busy={busy} disabled={!profile.first_name.trim() || !profile.last_name.trim()} onPress={saveProfile} />
        <Group>
          <Row icon="document-attach-outline" label="Manage your CV" external onPress={() => website('/profile')} />
          <Row icon="chatbubbles-outline" label="Messages" external onPress={() => website('/messages')} />
        </Group>
      </> : !accountError && !loadFailed && <ActivityIndicator color={C.teal} />}
      {push.PUSH_ENABLED && <Group>
        <View style={[s.row, { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 }]}>
          <Icon name="notifications-outline" size={20} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: C.ink }}>Job alerts</Text>
            <Text style={s.small}>New job notifications</Text>
          </View>
          <Switch value={alertsOn} disabled={alertsBusy} onValueChange={toggleAlerts} trackColor={{ false: C.line, true: C.bright }} thumbColor={C.white} ios_backgroundColor={C.line} accessibilityLabel="Job alerts" />
        </View>
      </Group>}
      <InfoRows />
      <Group><Row icon="log-out-outline" label="Sign out" plain busy={signingOut} onPress={signOut} /></Group>
      {!confirmingDelete ? <Press onPress={() => setConfirmingDelete(true)} style={{ alignSelf: 'center', paddingVertical: 8 }}><Text style={{ color: C.red, fontSize: 16 }}>Delete account</Text></Press> : <View style={s.card}>
        <Text style={s.h2}>Delete your account?</Text>
        <Text style={s.body}>{account?.role === 'employer'
          ? 'This permanently deletes your account, company, vacancies, and the applications and messages attached to them. This cannot be undone.'
          : 'This permanently deletes your account, profile, CV, applications, saved jobs, and messages. This cannot be undone.'}</Text>
        <Field label="Type DELETE to confirm" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
        {!!deleteError && <Text accessibilityRole="alert" style={s.error}>{deleteError}</Text>}
        <Button danger title="Permanently delete my account" busy={deleting} disabled={deleteText.trim() !== 'DELETE'} onPress={deleteAccount} />
        <Button secondary title="Keep my account" disabled={deleting} onPress={() => { setConfirmingDelete(false); setDeleteText(''); setDeleteError('') }} />
      </View>}
    </>}
    <Text style={[s.small, { textAlign: 'center' }]}>JobLinks · Made for Antigua & Barbuda</Text>
  </ScrollView></KeyboardArea>
})
