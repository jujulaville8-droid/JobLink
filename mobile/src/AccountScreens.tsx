import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { api, db, SITE } from './client'
import { useAccount } from './Auth'
import { fields, type Job } from './jobs'
import { JobCard } from './JobScreens'
import { Button, C, Empty, Field, s } from './ui'

export async function website(path: string) {
  try { await WebBrowser.openBrowserAsync(`${SITE}${path}`, { toolbarColor: C.bg, controlsColor: C.teal }) }
  catch { Alert.alert('Could not open the website', 'Please try again.') }
}
export function LibraryScreen({ mode, open, signIn, revision }: { mode: 'saved' | 'applications'; open: (job: Job) => void; signIn: () => void; revision: number }) {
  const { session, account } = useAccount()
  const [items, setItems] = useState<{ id: string; job: Job; status?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setItems([]); setError('')
    if (!session || account?.role !== 'seeker') return
    setBusy(true)
    void (async () => {
      try {
        const profile = await db.from('seeker_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
        if (profile.error) throw new Error('Could not load your profile.')
        if (!profile.data) return
        const result = mode === 'saved'
          ? await db.from('saved_jobs').select(`id,job:job_listings(${fields})`).eq('seeker_id', profile.data.id).order('created_at', { ascending: false }).limit(100)
          : await db.from('applications').select(`id,status,job:job_listings(${fields})`).eq('seeker_id', profile.data.id).order('applied_at', { ascending: false }).limit(100)
        if (result.error) throw new Error('Could not load your list. Please try again.')
        if (active) setItems((result.data as unknown as { id: string; job: Job; status?: string }[]).filter(item => item.job))
      } catch (e) { if (active) setError((e as Error).message) }
      finally { if (active) setBusy(false) }
    })()
    return () => { active = false }
  }, [mode, session?.user.id, account?.role, revision, reload])
  const title = mode === 'saved' ? 'Your shortlist.' : 'Your next steps.'
  if (!session) return <Empty title={title} body="Sign in with your JobLinks account to keep your hiring journey in one place."><Button title="Sign in" onPress={signIn} /></Empty>
  if (account?.role === 'employer') return <Empty title="Your employer workspace" body="Review your vacancies and manage hiring from the Account tab." />
  return <ScrollView contentContainerStyle={s.content}><Text style={s.eyebrow}>{mode === 'saved' ? 'SAVED JOBS' : 'APPLICATIONS'}</Text><Text style={s.h1}>{title}</Text>
    <Text style={s.body}>{mode === 'saved' ? 'The opportunities you want to come back to.' : 'Track the latest status shared by each employer.'}</Text>
    {busy && <ActivityIndicator color={C.teal} />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!busy && !error && !items.length && <Empty title={mode === 'saved' ? 'Start your shortlist' : 'Your first step starts here'} body={mode === 'saved' ? 'Save a job from its details screen and it will appear here.' : 'Apply for a role from Jobs. Complete your profile in Account first.'} />}
    {items.map(item => <JobCard key={item.id} job={item.job} open={open} status={item.status ? ({ applied: 'Applied', interview: 'Interview', rejected: 'Not selected', hold: 'On hold' }[item.status] || item.status) : undefined} />)}
    <Button secondary title="Refresh" busy={busy} onPress={() => setReload(x => x + 1)} />
    {items.length >= 100 && <Button secondary title="See full history on the website" onPress={() => website(mode === 'saved' ? '/saved' : '/applications')} />}
  </ScrollView>
}

type Profile = { id?: string; first_name: string; last_name: string; phone: string; location: string; bio: string; skills: string[]; experience_years: number | null; education: string; cv_url: string | null }
const blank: Profile = { first_name: '', last_name: '', phone: '', location: '', bio: '', skills: [], experience_years: null, education: '', cv_url: null }
export function AccountScreen() {
  const { session, account, loading, error: accountError, refresh } = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile>(blank)
  const [profileReady, setProfileReady] = useState(false)
  const [listings, setListings] = useState<{ id: string; title: string; status: string }[]>([])
  useEffect(() => {
    let active = true
    setProfile(blank); setProfileReady(false); setListings([]); setError('')
    if (!session || !account) return
    void (async () => {
      if (account.role === 'employer') {
        const company = await db.from('companies').select('id').eq('user_id', session.user.id).maybeSingle()
        if (company.error) throw new Error('Could not load your company.')
        if (!company.data) return
        const result = await db.from('job_listings').select('id,title,status').eq('company_id', company.data.id).order('created_at', { ascending: false }).limit(50)
        if (result.error) throw new Error('Could not load your listings.')
        if (active) setListings(result.data)
      } else {
        const result = await db.from('seeker_profiles').select('id,first_name,last_name,phone,location,bio,skills,experience_years,education,cv_url').eq('user_id', session.user.id).maybeSingle()
        if (result.error) throw new Error('Could not load your profile. Reopen Account to try again.')
        if (active) { setProfile(result.data ? { ...blank, ...result.data } : blank); setProfileReady(true) }
      }
    })().catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [session?.user.id, account?.role])
  async function signIn() {
    setBusy(true); setError('')
    try {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      setPassword('')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function saveProfile() {
    setBusy(true); setError('')
    try {
      const result = await api<{ profile_id: string }>('profile', { ...profile, profile_id: profile.id, first_name: profile.first_name.trim(), last_name: profile.last_name.trim() })
      setProfile(p => ({ ...p, id: result.profile_id })); Alert.alert('Profile saved', 'Your updated profile is available on JobLinks and ready for applications.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Text style={s.eyebrow}>YOUR JOBLINKS</Text><Text style={s.h1}>{session ? account?.role === 'employer' ? 'Your hiring hub.' : 'Make it yours.' : 'Welcome back.'}</Text>
    {loading && <ActivityIndicator color={C.teal} />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!accountError && <><Text accessibilityRole="alert" style={s.error}>{accountError}</Text><Button secondary title="Check account again" onPress={() => refresh().catch(e => setError(e.message))} /></>}
    {!session ? <>
      <Text style={s.body}>Your existing JobLinks account works here too.</Text>
      <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="password" onSubmitEditing={signIn} />
      <Button title="Sign in" busy={busy} disabled={!email.trim() || !password} onPress={signIn} />
      <Button secondary title="Create an account on JobLinks" onPress={() => website('/signup')} />
      <Button secondary title="Forgot your password?" onPress={() => website('/forgot-password')} />
      <Text style={[s.body, { fontSize: 13 }]}>Account creation and password recovery open the secure JobLinks website. After verifying your email, return here to sign in.</Text>
    </> : <>
      <Text style={s.body}>{session.user.email}</Text>
      {account?.role === 'employer' ? <>
        <Text style={s.body}>Your vacancies, connected to the same employer account you use on the website.</Text>
        {listings.map(item => <View key={item.id} style={s.card}><Text style={s.h2}>{item.title}</Text><Text style={s.pillText}>{item.status.replaceAll('_', ' ')}</Text></View>)}
        <Button title="Manage vacancies and applicants" onPress={() => website('/my-listings')} />
        <Button secondary title="Send us a vacancy" onPress={() => website('/employers/hiring-help')} />
        <Text style={[s.body, { fontSize: 13 }]}>Hiring tools open on the website. You may need to sign in there separately.</Text>
      </> : profileReady ? <>
        <Text style={s.h2}>Your candidate profile</Text>
        <Field label="First name" value={profile.first_name || ''} onChangeText={v => setProfile(p => ({ ...p, first_name: v }))} autoComplete="given-name" />
        <Field label="Last name" value={profile.last_name || ''} onChangeText={v => setProfile(p => ({ ...p, last_name: v }))} autoComplete="family-name" />
        <Field label="Phone" value={profile.phone || ''} onChangeText={v => setProfile(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
        <Field label="Location" value={profile.location || ''} onChangeText={v => setProfile(p => ({ ...p, location: v }))} placeholder="St. John's, Antigua" />
        <Field label="About you" value={profile.bio || ''} onChangeText={v => setProfile(p => ({ ...p, bio: v }))} multiline maxLength={2000} />
        <Button title="Save profile" busy={busy} disabled={!profile.first_name.trim() || !profile.last_name.trim()} onPress={saveProfile} />
        <Button secondary title="Manage your CV on the website" onPress={() => website('/profile')} />
      </> : !accountError && <ActivityIndicator color={C.teal} />}
      <Button secondary title="Open messages on the website" onPress={() => website('/messages')} />
      <Button secondary title="Sign out" onPress={() => { void db.auth.signOut().then(({ error }) => { if (error) setError(error.message) }) }} />
    </>}
    <View style={{ height: 1, backgroundColor: C.line }} /><Button secondary title="Privacy policy" onPress={() => website('/privacy')} />
    <Button secondary title="Terms of use" onPress={() => website('/terms')} />
    <Button secondary title="Contact JobLinks" onPress={() => { void Linking.openURL('mailto:jujulaville8@gmail.com?subject=JobLinks%20app%20support').catch(() => Alert.alert('Contact JobLinks', 'Email jujulaville8@gmail.com')) }} />
    <Text style={[s.body, { textAlign: 'center', fontSize: 12 }]}>JobLinks · Made for Antigua & Barbuda</Text>
  </ScrollView>
}
