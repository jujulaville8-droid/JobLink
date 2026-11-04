import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Image, Keyboard, Platform, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SecureStore from 'expo-secure-store'
import * as SplashScreen from 'expo-splash-screen'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Auth, useAccount } from './src/Auth'
import { configured } from './src/client'
import { JobsScreen, JobDetail } from './src/JobScreens'
import { AccountScreen, LibraryScreen } from './src/AccountScreens'
import { EmployerHome } from './src/EmployerScreens'
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

type Mode = 'seeker' | 'employer'
const MODE_KEY = 'app-mode'
const modeMemory = new Map<string, string>()
async function loadMode(): Promise<Mode> {
  try {
    const value = Platform.OS === 'web' ? modeMemory.get(MODE_KEY) : await SecureStore.getItemAsync(MODE_KEY)
    return value === 'employer' ? 'employer' : 'seeker'
  } catch { return 'seeker' }
}
function saveMode(next: Mode) {
  modeMemory.set(MODE_KEY, next)
  if (Platform.OS !== 'web') void SecureStore.setItemAsync(MODE_KEY, next).catch(() => {})
}

function Shell() {
  useLaunch()
  const { session } = useAccount()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<TabId>('jobs')
  const [job, setJob] = useState<Job | null>(null)
  const [revision, setRevision] = useState(0)
  const [top, setTop] = useState(0) // Bumped by re-tapping the active tab: that screen scrolls to top.
  const [home, setHome] = useState(0)
  const [mode, setModeState] = useState<Mode>('seeker')
  useEffect(() => { let live = true; void loadMode().then(saved => { if (live) setModeState(saved) }); return () => { live = false } }, [])
  const displayMode: Mode = session ? mode : 'seeker' // Signed out always shows the seeker app.
  // Tabs mount on first visit, then stay mounted so search, scroll and edits survive switching.
  const visited = useRef(new Set<TabId>())
  visited.current.add(tab)
  const employerVisited = useRef(false)
  if (displayMode === 'employer') employerVisited.current = true
  const goToAccount = useCallback(() => setTab('account'), [])
  const goToJobs = useCallback(() => setTab('jobs'), [])
  const goHome = useCallback(() => { Keyboard.dismiss(); setJob(null); setTab('jobs'); setHome(v => v + 1) }, [])
  const onChanged = useCallback(() => setRevision(v => v + 1), [])
  const closeJob = useCallback(() => setJob(null), [])
  const chooseMode = useCallback((next: Mode) => { Keyboard.dismiss(); setJob(null); setModeState(next); saveMode(next) }, [])
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (displayMode === 'employer') { chooseMode('seeker'); return true }
      if (tab === 'jobs') return false
      setTab('jobs')
      return true
    })
    return () => back.remove()
  }, [tab, displayMode, chooseMode])
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
      <View style={{ flexDirection: 'row', backgroundColor: C.wash, borderRadius: 30, padding: 3, alignSelf: 'center' }}>
        <Press accessibilityRole="tab" accessibilityState={{ selected: displayMode === 'seeker' }} onPress={() => chooseMode('seeker')} hitSlop={2} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 30, backgroundColor: displayMode === 'seeker' ? C.teal : 'transparent' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: displayMode === 'seeker' ? C.white : C.teal }}>Job seeker</Text>
        </Press>
        <Press accessibilityRole="tab" accessibilityState={{ selected: displayMode === 'employer' }} onPress={() => chooseMode('employer')} hitSlop={2} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 30, backgroundColor: displayMode === 'employer' ? C.teal : 'transparent' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: displayMode === 'employer' ? C.white : C.teal }}>Employer</Text>
        </Press>
      </View>
    </View>
    <View style={{ flex: 1 }}>
      {!configured ? <Empty title="Connect your JobLinks app" body="Add the public Supabase URL and publishable key to the app environment. Never use a service-role key." /> : <>
        <View style={{ flex: 1, display: displayMode === 'seeker' ? 'flex' : 'none' }}>
          <OptInCard visible={tab === 'jobs' && displayMode === 'seeker'} />
          {pane('jobs', <JobsScreen open={setJob} active={tab === 'jobs'} top={top} home={home} />)}
          {pane('saved', <LibraryScreen mode="saved" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'saved'} top={top} />)}
          {pane('applications', <LibraryScreen mode="applications" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'applications'} top={top} />)}
          {pane('account', <AccountScreen active={tab === 'account'} top={top} />)}
        </View>
        {employerVisited.current && <View style={{ flex: 1, display: displayMode === 'employer' ? 'flex' : 'none' }}><EmployerHome active={displayMode === 'employer'} signIn={goToAccount} /></View>}
      </>}
      <ToastHost />
    </View>
    {/* The tab bar owns the bottom inset, so white runs to the edge of the screen. */}
    {displayMode === 'seeker' && <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingTop: 8, paddingBottom: 8 + insets.bottom }}>
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
