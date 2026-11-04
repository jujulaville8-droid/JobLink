import { Children, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react'
import { ActivityIndicator, Animated, AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
export const C = { bg: '#FAF8F5', teal: '#095355', bright: '#0D7377', ink: '#172D2E', muted: '#5E7272', line: '#E0E8E5', amber: '#E8973E', white: '#FFFFFF', wash: '#EAF4F1', red: '#A32A2A', amberWash: '#FFF1DD', amberText: '#8A5310', grey: '#EEF1F0' }
type IconName = ComponentProps<typeof Ionicons>['name']
export function Icon({ name, color = C.teal, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return <Ionicons name={name} color={color} size={size} />
}
export function Button({ title, onPress, secondary, danger, busy, disabled }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy }} disabled={busy || disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, danger && { backgroundColor: C.red }, (pressed || busy || disabled) && { opacity: .65 }]}>
    {busy ? <ActivityIndicator color={secondary ? C.teal : C.white} /> : <Text style={[s.buttonText, secondary && { color: C.teal }]}>{title}</Text>}
  </Pressable>
}
/** Pressable with the platform's touch feedback: a ripple on Android, slight opacity on iOS. */
export function Press({ style, hitSlop = 8, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" hitSlop={hitSlop} android_ripple={{ color: 'rgba(9,83,85,.14)' }} {...props}
    style={({ pressed }) => [style, Platform.OS === 'ios' && pressed && { opacity: .6 }]} />
}
export function Field({ label, inputRef, ...props }: TextInputProps & { label: string; inputRef?: Ref<TextInput> }) {
  const [focused, setFocused] = useState(false)
  return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput ref={inputRef} accessibilityLabel={label} placeholderTextColor={C.muted} {...props}
    onFocus={e => { setFocused(true); props.onFocus?.(e) }} onBlur={e => { setFocused(false); props.onBlur?.(e) }}
    style={[s.input, focused && { borderColor: C.teal }, props.multiline && { minHeight: 120, textAlignVertical: 'top' }, props.style]} /></View>
}
/** One settings row: icon, label, and a chevron, or an external icon when it leaves the app. */
export function Row({ icon, label, external, plain, busy, onPress }: { icon: IconName; label: string; external?: boolean; plain?: boolean; busy?: boolean; onPress: () => void }) {
  return <Press hitSlop={0} accessibilityLabel={external ? `${label}, opens the website` : label} accessibilityState={{ busy: !!busy, disabled: !!busy }} disabled={busy} onPress={onPress}
    style={[s.row, { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 }]}>
    <Icon name={icon} size={20} /><Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{label}</Text>
    {busy ? <ActivityIndicator color={C.teal} /> : !plain && <Icon name={external ? 'open-outline' : 'chevron-forward'} size={18} color={C.muted} />}
  </Press>
}
/** A card of rows with hairlines between them. Falsy children are skipped. */
export function Group({ children }: { children: ReactNode }) {
  return <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
    {Children.toArray(children).map((child, i) => <View key={i} style={i > 0 && { borderTopWidth: 1, borderTopColor: C.line }}>{child}</View>)}
  </View>
}
/** Height of the app header above the tab content: 36 logo + 2 gap + 13 country line + 22 padding + 1 border. */
export const HEADER_HEIGHT = 74
/**
 * Keeps inputs above the keyboard on Android, where modals and edge-to-edge make window
 * resizing unreliable. iOS scroll views use automaticallyAdjustKeyboardInsets instead.
 * `offset` is the distance from the top of the window to this view's parent.
 */
export function KeyboardArea({ offset = 0, children }: { offset?: number; children: ReactNode }) {
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'padding' : undefined} keyboardVerticalOffset={offset}>{children}</KeyboardAvoidingView>
}
export function Empty({ icon = 'briefcase-outline', title, body, children }: { icon?: IconName; title: string; body: string; children?: ReactNode }) {
  return <View style={s.empty}><Icon name={icon} size={36} /><Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text><Text style={[s.body, { textAlign: 'center' }]}>{body}</Text>{children}</View>
}
export const CardGap = () => <View style={{ height: 12 }} />
/** Placeholder cards the same shape as JobCard, for first loads only. */
export function Skeletons() {
  const pulse = useRef(new Animated.Value(.5)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: .5, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const bone = { backgroundColor: C.wash, borderRadius: 8 }
  return <Animated.View accessibilityLabel="Loading" style={{ opacity: pulse, gap: 12 }}>
    {[0, 1, 2, 3].map(i => <View key={i} style={s.card}>
      <View style={s.row}><View style={[bone, { width: 44, height: 44, borderRadius: 12 }]} />
        <View style={{ flex: 1, gap: 8 }}><View style={[bone, { height: 16, width: '75%' }]} /><View style={[bone, { height: 12, width: '50%' }]} /></View></View>
      <View style={[bone, { height: 26, width: 88, borderRadius: 30 }]} />
    </View>)}
  </Animated.View>
}
const STALE_AFTER = 5 * 60 * 1000
/** While active, calls refresh on entry or app resume if the last check is older than five minutes. */
export function useStaleRefresh(active: boolean, refresh: () => void) {
  const checked = useRef(Date.now())
  const latest = useRef(refresh)
  latest.current = refresh
  useEffect(() => {
    if (!active) return
    const check = () => { if (Date.now() - checked.current > STALE_AFTER) { checked.current = Date.now(); latest.current() } }
    check()
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check() })
    return () => subscription.remove()
  }, [active])
}

const ToastContext = createContext<{ message: string; opacity: Animated.Value | null; show: (message: string) => void }>({ message: '', opacity: null, show: () => {} })
export const useToast = () => useContext(ToastContext).show
/** Small confirmations that don't need dismissing. Real decisions stay as Alerts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((next: string) => {
    clearTimeout(timer.current)
    setMessage(next)
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => { if (finished) setMessage('') })
    }, 2400)
  }, [opacity])
  const value = useMemo(() => ({ message, opacity, show }), [message, opacity, show])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}
/** Where the toast draws. The job modal covers the app, so it needs a host of its own. */
export function ToastHost({ bottom = 16 }: { bottom?: number }) {
  const { message, opacity } = useContext(ToastContext)
  if (!message || !opacity) return null
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 16, right: 16, bottom, alignItems: 'center', opacity }}>
    <View style={{ backgroundColor: C.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}><Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>{message}</Text></View>
  </Animated.View>
}

// Spacing uses 4/8/12/16/24. Type uses 11, 13, 16, 17, 20 and 24.
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, content: { padding: 16, gap: 16, paddingBottom: 32 }, list: { padding: 16, paddingBottom: 24 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -.6, color: C.ink },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: C.ink },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: C.ink }, small: { fontSize: 13, lineHeight: 18, color: C.muted },
  body: { fontSize: 16, lineHeight: 24, color: C.muted }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: C.bright },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: C.ink },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, minHeight: 48, fontSize: 16, color: C.ink },
  button: { backgroundColor: C.teal, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 12 },
  secondary: { backgroundColor: C.wash }, buttonText: { color: C.white, fontWeight: '700', fontSize: 16 },
  pill: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 30, backgroundColor: C.wash },
  pillText: { color: C.teal, fontSize: 13, lineHeight: 18, fontWeight: '600' }, empty: { alignItems: 'center', padding: 24, gap: 16 },
  error: { color: C.red, backgroundColor: '#FFF0ED', padding: 12, borderRadius: 12, fontSize: 16, lineHeight: 24 },
})
