import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Auth } from './src/Auth'
import { configured } from './src/client'
import { JobsScreen, JobDetail } from './src/JobScreens'
import { AccountScreen, LibraryScreen } from './src/AccountScreens'
import { C, Empty, Icon, s } from './src/ui'
import type { Job } from './src/jobs'

const tabs = [
  { id: 'jobs', label: 'Find jobs', icon: 'search-outline' },
  { id: 'saved', label: 'Saved', icon: 'bookmark-outline' },
  { id: 'applications', label: 'Applications', icon: 'paper-plane-outline' },
  { id: 'account', label: 'Account', icon: 'person-circle-outline' },
] as const
function Shell() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('jobs')
  const [job, setJob] = useState<Job | null>(null)
  const [revision, setRevision] = useState(0)
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
    <StatusBar style="dark" />
    <View style={[s.row, { paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }]}>
      <Image source={require('./assets/joblink-icon.png')} style={{ width: 36, height: 36 }} resizeMode="contain" accessibilityLabel="JobLinks" />
      <Text style={{ color: C.teal, fontWeight: '800', fontSize: 22, letterSpacing: -.7 }}>JobLinks</Text>
      <View style={{ flex: 1 }} /><Text style={{ fontSize: 10, letterSpacing: 1.5, color: C.muted }}>ANTIGUA & BARBUDA</Text>
    </View>
    <View style={{ flex: 1 }}>
      {!configured ? <Empty title="Connect your JobLinks app" body="Add the public Supabase URL and publishable key to the app environment. Never use a service-role key." />
        : tab === 'jobs' ? <JobsScreen open={setJob} />
        : tab === 'account' ? <AccountScreen />
        : <LibraryScreen key={tab} mode={tab} open={setJob} signIn={() => setTab('account')} revision={revision} />}
    </View>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingTop: 10, paddingBottom: 8 }}>
      {tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={{ flex: 1, alignItems: 'center', gap: 5, minHeight: 48 }}>
        <Icon name={item.icon} color={tab === item.id ? C.teal : C.muted} /><Text style={{ fontSize: 10, fontWeight: tab === item.id ? '800' : '500', color: tab === item.id ? C.teal : C.muted }}>{item.label}</Text>
        {tab === item.id && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.teal }} />}
      </Pressable>)}
    </View>
    <JobDetail job={job} close={() => setJob(null)} signIn={() => setTab('account')} onChanged={() => setRevision(v => v + 1)} />
  </SafeAreaView>
}
export default function App() {
  return <SafeAreaProvider><Auth><Shell /></Auth></SafeAreaProvider>
}
