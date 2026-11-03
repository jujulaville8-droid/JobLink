import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Image, Keyboard, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Auth, useAccount } from './src/Auth'
import { configured } from './src/client'
import { JobsScreen, JobDetail } from './src/JobScreens'
import { AccountScreen, LibraryScreen } from './src/AccountScreens'
import { C, Empty, Icon, Press, s, ToastHost, ToastProvider } from './src/ui'
import type { Job } from './src/jobs'

SplashScreen.preventAutoHideAsync().catch(() => {})

const tabs = [
  { id: 'jobs', label: 'Find jobs', icon: 'search-outline', activeIcon: 'search' },
  { id: 'saved', label: 'Saved', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { id: 'applications', label: 'Applications', icon: 'paper-plane-outline', activeIcon: 'paper-plane' },
  { id: 'account', label: 'Account', icon: 'person-circle-outline', activeIcon: 'person-circle' },
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

function Shell() {
  useLaunch()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<TabId>('jobs')
  const [job, setJob] = useState<Job | null>(null)
  const [revision, setRevision] = useState(0)
  const [top, setTop] = useState(0) // Bumped by re-tapping the active tab: that screen scrolls to top.
  // Tabs mount on first visit, then stay mounted so search, scroll and edits survive switching.
  const visited = useRef(new Set<TabId>())
  visited.current.add(tab)
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'jobs') return false
      setTab('jobs')
      return true
    })
    return () => back.remove()
  }, [tab])
  const goToAccount = useCallback(() => setTab('account'), [])
  const goToJobs = useCallback(() => setTab('jobs'), [])
  const onChanged = useCallback(() => setRevision(v => v + 1), [])
  const closeJob = useCallback(() => setJob(null), [])
  function pressTab(id: TabId) {
    Keyboard.dismiss()
    if (id === tab) setTop(v => v + 1)
    else setTab(id)
  }
  const pane = (id: TabId, screen: ReactNode) => visited.current.has(id) && <View key={id} style={{ flex: 1, display: tab === id ? 'flex' : 'none' }}>{screen}</View>
  return <SafeAreaView style={s.screen} edges={['top']}>
    <StatusBar style="dark" />
    <View style={[s.row, { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }]}>
      <Image source={require('./assets/joblink-mark.png')} style={{ width: 29, height: 36 }} resizeMode="contain" accessibilityLabel="JobLinks" />
      <Text style={{ color: C.teal, fontWeight: '800', fontSize: 20, letterSpacing: -.6 }}>JobLinks</Text>
      <View style={{ flex: 1 }} /><Text style={{ fontSize: 11, letterSpacing: 1.5, color: C.muted }}>ANTIGUA & BARBUDA</Text>
    </View>
    <View style={{ flex: 1 }}>
      {!configured ? <Empty title="Connect your JobLinks app" body="Add the public Supabase URL and publishable key to the app environment. Never use a service-role key." /> : <>
        {pane('jobs', <JobsScreen open={setJob} active={tab === 'jobs'} top={top} />)}
        {pane('saved', <LibraryScreen mode="saved" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'saved'} top={top} />)}
        {pane('applications', <LibraryScreen mode="applications" open={setJob} signIn={goToAccount} browse={goToJobs} revision={revision} active={tab === 'applications'} top={top} />)}
        {pane('account', <AccountScreen active={tab === 'account'} top={top} />)}
      </>}
      <ToastHost />
    </View>
    {/* The tab bar owns the bottom inset, so white runs to the edge of the screen. */}
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingTop: 8, paddingBottom: 8 + insets.bottom }}>
      {tabs.map(item => <Press key={item.id} hitSlop={0} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => pressTab(item.id)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>
        <Icon name={tab === item.id ? item.activeIcon : item.icon} color={tab === item.id ? C.teal : C.muted} /><Text style={{ fontSize: 11, fontWeight: tab === item.id ? '800' : '500', color: tab === item.id ? C.teal : C.muted }}>{item.label}</Text>
      </Press>)}
    </View>
    <JobDetail job={job} close={closeJob} signIn={goToAccount} viewApplications={() => setTab('applications')} onChanged={onChanged} />
  </SafeAreaView>
}
export default function App() {
  return <SafeAreaProvider><ToastProvider><Auth><Shell /></Auth></ToastProvider></SafeAreaProvider>
}
