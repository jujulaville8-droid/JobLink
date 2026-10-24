import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
export const C = { bg: '#FAF8F5', teal: '#095355', bright: '#0D7377', ink: '#172D2E', muted: '#637777', line: '#E0E8E5', amber: '#E8973E', white: '#FFFFFF', wash: '#EAF4F1', red: '#A32A2A' }
export function Icon({ name, color = C.teal, size = 22 }: { name: ComponentProps<typeof Ionicons>['name']; color?: string; size?: number }) {
  return <Ionicons name={name} color={color} size={size} />
}
export function Button({ title, onPress, secondary, busy, disabled }: { title: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy }} disabled={busy || disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, (pressed || busy || disabled) && { opacity: .65 }]}>
    {busy ? <ActivityIndicator color={secondary ? C.teal : C.white} /> : <Text style={[s.buttonText, secondary && { color: C.teal }]}>{title}</Text>}
  </Pressable>
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={C.muted} {...props} style={[s.input, props.multiline && { minHeight: 120, textAlignVertical: 'top' }, props.style]} /></View>
}
export function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return <View style={s.empty}><Icon name="briefcase-outline" size={36} /><Text style={s.h2}>{title}</Text><Text style={[s.body, { textAlign: 'center' }]}>{body}</Text>{children}</View>
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, content: { padding: 22, gap: 20, paddingBottom: 40 },
  h1: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.1, color: C.ink },
  h2: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: C.ink },
  body: { fontSize: 16, lineHeight: 25, color: C.muted }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: C.bright },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.line, gap: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, label: { fontSize: 14, fontWeight: '600', color: C.ink },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 15, fontSize: 16, color: C.ink },
  button: { backgroundColor: C.teal, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 14 },
  secondary: { backgroundColor: C.wash }, buttonText: { color: C.white, fontWeight: '700', fontSize: 16 },
  pill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 30, backgroundColor: C.wash },
  pillText: { color: C.teal, fontSize: 12, fontWeight: '600' }, empty: { alignItems: 'center', padding: 28, gap: 16 },
  error: { color: C.red, backgroundColor: '#FFF0ED', padding: 14, borderRadius: 12, fontSize: 15 },
})
