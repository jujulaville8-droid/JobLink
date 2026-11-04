import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Image, Keyboard, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Auth, useAccount } from './src/Auth'
import { configured } from './src/client'
import { JobsScreen, JobDetail } from './src/JobScreens'
import { AccountScreen, EmployerNotice, LibraryScreen } from './src/AccountScreens'
import { Button, C, Empty, Icon, Press, s, ToastHost, ToastProvider, useToast } from './src/ui'
import * as push from './src/notifications'
import type { Job } from './src/jobs'

SplashScreen.preventAutoHideAsync().catch(() => {})

const tabs = [
  { id: 'jobs', label: 'Find jobs', icon: 'search-outline', activeIcon: 'search' },
  { id: 'saved', label: 'Saved', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { id: 'applications', label: 'Applications', icon: 'paper-plane-outline', activeIcon: 'paper-plane' },
  { id: 'account', label: 'Profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
] as const
type TabId = (typeof tabs)[number]['id']

/** Holds the splash until icons and the stored session are ready, with a limit so it can't stick. */
function useLaunch() {
  const { loading } = useAccount()
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    Ionicons.loadFont().catch(() => {}).finally(() => setFontReady(true))
    const limit = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}) }, 4000)
    return () => clearTimeout(limit)
  }, [])
  useEffect(() => { if (fontReady && !loading) SplashScreen.hideAsync().catch(() => {}) }, [fontReady, loading])
}

/**
 * One time opt in for job alerts. Renders nothing until a signed in user who
 * has never answered is on Find jobs; an earlier yes re-registers silently so
 * alerts resume after signing back in.
 */
function OptInCard({ visible }: { visible: boolean }) {
  const { session } = useAccount()
  const toast = useToast()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const userId = session?.user.id
  useEffect(() => {
    if (!push.PUSH_ENABLED) return
    setShow(false)
    if (!userId) return
    let live = true
    void (async () => {
      const decision = await push.getDecision()
      if (!live) return
      if (decision === 'enabled') void push.refreshRegistration(userId)
      else if (decision === null) setShow(true)
    })()
    return () => { live = false }
  }, [userId])
  if (!push.PUSH_ENABLED || !visible || !show || !userId) return null
  async function enable() {
    if (busy) return
    setBusy(true)
    const result = await push.registerForPush(userId!)
    setBusy(false)
    if (result.status === 'registered') {
      await push.setDecision('enabled')
      setShow(false)
      toast('Job alerts are on')
    } else if (result.status === 'denied') {
      await push.setDecision('declined')
      setShow(false)
      toast('Alerts are off. You can turn them on any time in the Profile tab.')
    } else if (result.status === 'unavailable') {
      await push.setDecision('declined')
      setShow(false)
      toast('This device cannot receive job alerts.')
    } else {
      toast('Could not turn on job alerts. Please try again.')
    }
  }
  async function notNow() {
    await push.setDecision('declined')
    setShow(false)
  }
  return <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
    <View style={s.card}>
      <Text style={s.cardTitle}>Job alerts</Text>
      <Text style={s.body}>Get a notification when new jobs are posted. You can turn this off any time in your Profile tab.</Text>
      <Button title="Enable" busy={busy} onPress={enable} />
      <Button secondary title="Not now" disabled={busy} onPress={notNow} />
    </View>
  </View>
}

function Shell() {
  useLaunch()
  const { session, account } = useAccount()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<TabId>('jobs')
  const [job, setJob] = useState<Job | null>(null)
  const [revision, setRevision] = useState(0)
  const [top, setTop] = useState(0) // Bumped by re-tapping the active tab: that screen scrolls to top.
  const [home, setHome] = useState(0)
  const isEmployer = !!session && account?.role === 'employer' // Employer accounts get the website notice, not the seeker app.
  // Tabs mount on first visit, then stay mounted so search, scroll and edits survive switching.
  const visited = useRef(new Set<TabId>())
  visited.current.add(tab)
  const goToAccount = useCallback(() => setTab('account'), [])
  const goToJobs = useCallback(() => setTab('jobs'), [])
  const goHome = useCallback(() => { Keyboard.dismiss(); setJob(null); setTab('jobs'); setHome(v => v + 1) }, [])
  const onChanged = useCallback(() => setRevision(v => v + 1), [])
  const closeJob = useCallback(() => setJob(null), [])
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isEmployer) return false // The notice screen has no tabs behind it; let the press leave the app.
      if (tab === 'jobs') return false
      setTab('jobs')
      return true
    })
    return () => back.remove()
  }, [tab, isEmployer])
  function pressTab(id: TabId) {
    Keyboard.dismiss()
    if (id === tab) setTop(v => v + 1)
    else setTab(id)
  }
  const pane = (id: TabId, screen: ReactNode) => visited.current.has(id) && <View key={id} style={{ flex: 1, display: tab === id ? 'flex' : 'none' }}>{screen}</View>
  return <SafeAreaView style={s.screen} edges={['top']}>
    <StatusBar style="dark" />
    <View style={[s.row, { alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }]}>
      <Press accessibilityRole="button" accessibilityLabel="JobLinks home" onPress={goHome} hitSlop={4}>
        <View>
          <View style={s.row}>
            <Image source={require('./assets/joblink-mark.png')} style={{ width: 29, height: 36 }} resizeMode="contain" accessibilityLabel="JobLinks" />
            <Text style={{ color: C.teal, fontWeight: '800', fontSize: 20, letterSpacing: -.6 }}>JobLinks</Text>
          </View>
          <Text style={{ fontSize: 10, letterSpacing: 1.5, color: C.muted, marginTop: 2, lineHeight: 13 }}>ANTIGUA & BARBUDA</Text>
        </View>
      </Press>
      <View style={{ flex: 1 }} />
    </View>
    <View style={{ flex: 1 }}>
      {!configured ? <Empty title="Connect your JobLinks app" body="Add the public Supabase URL and publishable key to the app environment. Never use a service-role key." /> : isEmployer ? <EmployerNotice /> : <>
        <View style={{ flex: 1 }}>
          <OptInCard visible={tab === 'jobs'} />
          {pane('jobs', <JobsScreen open={setJob} active={tab === 'jobs'} top={top} home={home} />)}
          {pane('saved', <LibraryScreen mode="saved" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'saved'} top={top} />)}
          {pane('applications', <LibraryScreen mode="applications" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'applications'} top={top} />)}
          {pane('account', <AccountScreen active={tab === 'account'} top={top} />)}
        </View>
      </>}
      <ToastHost />
    </View>
    {/* The tab bar owns the bottom inset, so white runs to the edge of the screen. */}
    {!isEmployer && <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingTop: 8, paddingBottom: 8 + insets.bottom }}>
      {tabs.map(item => <Press key={item.id} hitSlop={0} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => pressTab(item.id)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>
        <Icon name={tab === item.id ? item.activeIcon : item.icon} color={tab === item.id ? C.teal : C.muted} /><Text style={{ fontSize: 11, fontWeight: tab === item.id ? '800' : '500', color: tab === item.id ? C.teal : C.muted }}>{item.label}</Text>
      </Press>)}
    </View>}
    <JobDetail job={job} close={closeJob} signIn={goToAccount} viewApplications={() => setTab('applications')} onChanged={onChanged} />
  </SafeAreaView>
}
export default function App() {
  return <SafeAreaProvider><ToastProvider><Auth><Shell /></Auth></ToastProvider></SafeAreaProvider>
}
