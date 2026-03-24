import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CvFull } from '@/lib/types'

export type ThemeId =
  | 'classic'
  | 'sidebar'
  | 'banner'
  | 'minimal'
  | 'professional'
  | 'executive'
  | 'timeline'
  | 'modular'
  | 'compact'
  | 'elegant'

export const THEME_LIST: { id: ThemeId; name: string; description: string; color: string; layout: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Clean single column, ATS optimized', color: '#1a1a1a', layout: 'single' },
  { id: 'sidebar', name: 'Sidebar', description: 'Dark left sidebar with contact and skills', color: '#1e293b', layout: 'two-col' },
  { id: 'banner', name: 'Banner', description: 'Bold colored header block', color: '#0d7377', layout: 'single' },
  { id: 'minimal', name: 'Minimal', description: 'Typography focused, no decoration', color: '#525252', layout: 'single' },
  { id: 'professional', name: 'Professional', description: 'Navy accents with left border sections', color: '#1e3a5f', layout: 'single' },
  { id: 'executive', name: 'Executive', description: 'Two equal columns with colored bars', color: '#7c3aed', layout: 'two-col' },
  { id: 'timeline', name: 'Timeline', description: 'Vertical timeline with markers', color: '#0369a1', layout: 'single' },
  { id: 'modular', name: 'Modular', description: 'Card-based block layout', color: '#ea580c', layout: 'two-col' },
  { id: 'compact', name: 'Compact', description: 'Three panel header, dense layout', color: '#15803d', layout: 'single' },
  { id: 'elegant', name: 'Elegant', description: 'Serif typography, refined spacing', color: '#be185d', layout: 'single' },
]

function fmtDate(d: string | null | undefined): string {
  if (!d) return 'Present'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function createCvDocument(cv: CvFull, theme: ThemeId = 'classic') {
  switch (theme) {
    case 'sidebar': return <SidebarTemplate cv={cv} />
    case 'banner': return <BannerTemplate cv={cv} />
    case 'minimal': return <MinimalTemplate cv={cv} />
    case 'professional': return <ProfessionalTemplate cv={cv} />
    case 'executive': return <ExecutiveTemplate cv={cv} />
    case 'timeline': return <TimelineTemplate cv={cv} />
    case 'modular': return <ModularTemplate cv={cv} />
    case 'compact': return <CompactTemplate cv={cv} />
    case 'elegant': return <ElegantTemplate cv={cv} />
    default: return <ClassicTemplate cv={cv} />
  }
}

// Shared helpers
function getName(cv: CvFull) {
  return [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Name'
}
function getContact(cv: CvFull) {
  return [cv.contact.email, cv.contact.phone, cv.contact.location].filter(Boolean)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. CLASSIC — Single column, ATS optimized, maximum content density
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ClassicTemplate({ cv }: { cv: CvFull }) {
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
    name: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
    title: { fontSize: 12, textAlign: 'center', color: '#4b5563', marginBottom: 8 },
    contactRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
    contactItem: { fontSize: 9, color: '#6b7280' },
    sep: { fontSize: 9, color: '#d1d5db' },
    section: { fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 16, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
    entry: { marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
    date: { fontSize: 9, color: '#6b7280' },
    subtitle: { fontSize: 9.5, color: '#4b5563', marginBottom: 2 },
    desc: { fontSize: 9, color: '#4b5563', lineHeight: 1.5 },
    summary: { fontSize: 10, lineHeight: 1.6, color: '#4b5563', marginBottom: 4 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    skill: { fontSize: 9, color: '#4b5563' },
    footer: { position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{getName(cv)}</Text>
        {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
        <View style={s.contactRow}>
          {getContact(cv).map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={s.sep}>|</Text>}
              <Text style={s.contactItem}>{c}</Text>
            </React.Fragment>
          ))}
        </View>
        {cv.profile.summary && (<><Text style={s.section}>Profile</Text><Text style={s.summary}>{cv.profile.summary}</Text></>)}
        {cv.experiences.length > 0 && (<><Text style={s.section}>Experience</Text>{cv.experiences.map(e => (
          <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
        ))}</>)}
        {cv.education.length > 0 && (<><Text style={s.section}>Education</Text>{cv.education.map(e => (
          <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text>{e.start_date && <Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text>}</View><Text style={s.subtitle}>{e.institution}</Text></View>
        ))}</>)}
        {cv.skills.length > 0 && (<><Text style={s.section}>Skills</Text><View style={s.skillsRow}>{cv.skills.map((sk, i) => <Text key={sk.id} style={s.skill}>{sk.name}{i < cv.skills.length - 1 ? '  ·  ' : ''}</Text>)}</View></>)}
        {cv.awards.length > 0 && (<><Text style={s.section}>Awards</Text>{cv.awards.map(a => <View key={a.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{a.title}</Text>{a.date_received && <Text style={s.date}>{fmtDate(a.date_received)}</Text>}</View>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}{a.description && <Text style={s.desc}>{a.description}</Text>}</View>)}</>)}
        {cv.certifications.length > 0 && (<><Text style={s.section}>Certifications</Text>{cv.certifications.map(c => <View key={c.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{c.name}</Text>{c.issue_date && <Text style={s.date}>{fmtDate(c.issue_date)}</Text>}</View>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. SIDEBAR — Dark left sidebar (30/70 split)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SidebarTemplate({ cv }: { cv: CvFull }) {
  const DARK = '#1e293b'
  const ACCENT = '#38bdf8'
  const s = StyleSheet.create({
    page: { flexDirection: 'row', fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
    sidebar: { width: '30%', backgroundColor: DARK, padding: 24, paddingTop: 36, color: '#ffffff' },
    main: { width: '70%', padding: 36 },
    sidebarName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 4 },
    sidebarTitle: { fontSize: 10, color: ACCENT, marginBottom: 16 },
    sidebarSection: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, color: ACCENT, marginTop: 16, marginBottom: 6 },
    sidebarText: { fontSize: 9, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 3 },
    skillBar: { marginBottom: 6 },
    skillName: { fontSize: 8, color: '#e2e8f0', marginBottom: 2 },
    barBg: { height: 4, backgroundColor: '#334155', borderRadius: 2 },
    barFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
    section: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase', letterSpacing: 1, marginTop: 18, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1.5, borderBottomColor: ACCENT },
    entry: { marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
    date: { fontSize: 9, color: '#6b7280' },
    subtitle: { fontSize: 9.5, color: '#4b5563', marginBottom: 2 },
    desc: { fontSize: 9, color: '#4b5563', lineHeight: 1.55 },
    summary: { fontSize: 10, lineHeight: 1.6, color: '#4b5563' },
    footer: { position: 'absolute', bottom: 16, right: 36, fontSize: 7, color: '#d1d5db' },
  })
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.sidebar}>
          <Text style={s.sidebarName}>{getName(cv)}</Text>
          {cv.profile.job_title && <Text style={s.sidebarTitle}>{cv.profile.job_title}</Text>}
          <Text style={s.sidebarSection}>Contact</Text>
          {getContact(cv).map((c, i) => <Text key={i} style={s.sidebarText}>{c}</Text>)}
          {cv.skills.length > 0 && (<><Text style={s.sidebarSection}>Skills</Text>{cv.skills.slice(0, 8).map((sk, i) => (
            <View key={sk.id} style={s.skillBar}><Text style={s.skillName}>{sk.name}</Text><View style={s.barBg}><View style={[s.barFill, { width: `${Math.max(40, 100 - i * 8)}%` }]} /></View></View>
          ))}</>)}
          {cv.certifications.length > 0 && (<><Text style={s.sidebarSection}>Certifications</Text>{cv.certifications.map(c => <Text key={c.id} style={s.sidebarText}>{c.name}</Text>)}</>)}
        </View>
        <View style={s.main}>
          {cv.profile.summary && (<><Text style={s.section}>Profile</Text><Text style={s.summary}>{cv.profile.summary}</Text></>)}
          {cv.experiences.length > 0 && (<><Text style={s.section}>Experience</Text>{cv.experiences.map(e => (
            <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
          ))}</>)}
          {cv.education.length > 0 && (<><Text style={s.section}>Education</Text>{cv.education.map(e => (
            <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text></View><Text style={s.subtitle}>{e.institution}</Text></View>
          ))}</>)}
          {cv.awards.length > 0 && (<><Text style={s.section}>Awards</Text>{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
          <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
        </View>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. BANNER — Bold colored header block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BannerTemplate({ cv }: { cv: CvFull }) {
  const PRIMARY = '#0d7377'
  const s = StyleSheet.create({
    page: { fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
    banner: { backgroundColor: PRIMARY, padding: 36, paddingBottom: 28 },
    name: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 4 },
    title: { fontSize: 12, color: '#99e6e9', marginBottom: 12 },
    contactRow: { flexDirection: 'row', gap: 6 },
    contactItem: { fontSize: 9, color: '#b2f0f2' },
    body: { padding: 36, paddingTop: 24 },
    section: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
    sectionDot: { width: 8, height: 8, backgroundColor: PRIMARY, borderRadius: 4, marginRight: 8, marginTop: 2 },
    sectionRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, marginBottom: 8 },
    entry: { marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
    date: { fontSize: 9, color: '#6b7280' },
    subtitle: { fontSize: 9.5, color: '#4b5563', marginBottom: 2 },
    desc: { fontSize: 9, color: '#4b5563', lineHeight: 1.55 },
    summary: { fontSize: 10, lineHeight: 1.6, color: '#4b5563' },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    skillChip: { backgroundColor: '#e6f4f4', color: PRIMARY, fontSize: 9, fontFamily: 'Helvetica-Bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    footer: { position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  const SectionHead = ({ title }: { title: string }) => (
    <View style={s.sectionRow}><View style={s.sectionDot} /><Text style={s.section}>{title}</Text></View>
  )
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.banner}>
          <Text style={s.name}>{getName(cv)}</Text>
          {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
          <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  |  ' : ''}{c}</Text>)}</View>
        </View>
        <View style={s.body}>
          {cv.profile.summary && (<><SectionHead title="Profile" /><Text style={s.summary}>{cv.profile.summary}</Text></>)}
          {cv.experiences.length > 0 && (<><SectionHead title="Experience" />{cv.experiences.map(e => (
            <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
          ))}</>)}
          {cv.education.length > 0 && (<><SectionHead title="Education" />{cv.education.map(e => (
            <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text></View><Text style={s.subtitle}>{e.institution}</Text></View>
          ))}</>)}
          {cv.skills.length > 0 && (<><SectionHead title="Skills" /><View style={s.skillsRow}>{cv.skills.map(sk => <Text key={sk.id} style={s.skillChip}>{sk.name}</Text>)}</View></>)}
          {cv.awards.length > 0 && (<><SectionHead title="Awards" />{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
          {cv.certifications.length > 0 && (<><SectionHead title="Certifications" />{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        </View>
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. MINIMAL — Typography only, no decoration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MinimalTemplate({ cv }: { cv: CvFull }) {
  const s = StyleSheet.create({
    page: { paddingHorizontal: 65, paddingVertical: 50, fontSize: 10.5, fontFamily: 'Times-Roman', color: '#262626' },
    name: { fontSize: 28, fontFamily: 'Times-Roman', textAlign: 'center', marginBottom: 4, color: '#262626' },
    title: { fontSize: 11, textAlign: 'center', color: '#737373', marginBottom: 8 },
    contactRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
    contactItem: { fontSize: 9, color: '#a3a3a3', fontFamily: 'Helvetica' },
    section: { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 3, color: '#a3a3a3', marginTop: 24, marginBottom: 10 },
    entry: { marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Times-Bold', fontSize: 11 },
    date: { fontSize: 9, color: '#a3a3a3', fontFamily: 'Helvetica' },
    subtitle: { fontSize: 10, color: '#737373', marginBottom: 2 },
    desc: { fontSize: 10, color: '#525252', lineHeight: 1.6 },
    summary: { fontSize: 10.5, lineHeight: 1.7, color: '#525252' },
    skills: { fontSize: 10, color: '#525252', lineHeight: 1.6 },
    footer: { position: 'absolute', bottom: 20, left: 65, right: 65, textAlign: 'center', fontSize: 7, color: '#e5e5e5' },
  })
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{getName(cv)}</Text>
        {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
        <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  ·  ' : ''}{c}</Text>)}</View>
        {cv.profile.summary && (<><Text style={s.section}>Profile</Text><Text style={s.summary}>{cv.profile.summary}</Text></>)}
        {cv.experiences.length > 0 && (<><Text style={s.section}>Experience</Text>{cv.experiences.map(e => (
          <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
        ))}</>)}
        {cv.education.length > 0 && (<><Text style={s.section}>Education</Text>{cv.education.map(e => (
          <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
        ))}</>)}
        {cv.skills.length > 0 && (<><Text style={s.section}>Skills</Text><Text style={s.skills}>{cv.skills.map(sk => sk.name).join(', ')}</Text></>)}
        {cv.awards.length > 0 && (<><Text style={s.section}>Awards</Text>{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
        {cv.certifications.length > 0 && (<><Text style={s.section}>Certifications</Text>{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. PROFESSIONAL — Navy with left border accents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ProfessionalTemplate({ cv }: { cv: CvFull }) {
  const NAVY = '#1e3a5f'
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1e293b' },
    header: { borderBottomWidth: 3, borderBottomColor: NAVY, paddingBottom: 14, marginBottom: 20 },
    name: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY },
    title: { fontSize: 11, color: '#64748b', marginTop: 3 },
    contactRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    contactItem: { fontSize: 9, color: '#64748b' },
    section: { borderLeftWidth: 3, borderLeftColor: NAVY, paddingLeft: 10, marginTop: 18, marginBottom: 8 },
    sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 1 },
    entry: { marginBottom: 10, marginLeft: 13 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
    date: { fontSize: 9, color: '#94a3b8' },
    subtitle: { fontSize: 9.5, color: '#475569', marginBottom: 2 },
    desc: { fontSize: 9, color: '#475569', lineHeight: 1.55 },
    summary: { fontSize: 10, lineHeight: 1.6, color: '#475569', marginLeft: 13 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginLeft: 13 },
    skillChip: { backgroundColor: '#eff6ff', color: NAVY, fontSize: 9, fontFamily: 'Helvetica-Bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    footer: { position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.name}>{getName(cv)}</Text>
          {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
          <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  |  ' : ''}{c}</Text>)}</View>
        </View>
        {cv.profile.summary && (<><View style={s.section}><Text style={s.sectionTitle}>Profile</Text></View><Text style={s.summary}>{cv.profile.summary}</Text></>)}
        {cv.experiences.length > 0 && (<><View style={s.section}><Text style={s.sectionTitle}>Experience</Text></View>{cv.experiences.map(e => (
          <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
        ))}</>)}
        {cv.education.length > 0 && (<><View style={s.section}><Text style={s.sectionTitle}>Education</Text></View>{cv.education.map(e => (
          <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
        ))}</>)}
        {cv.skills.length > 0 && (<><View style={s.section}><Text style={s.sectionTitle}>Skills</Text></View><View style={s.skillsRow}>{cv.skills.map(sk => <Text key={sk.id} style={s.skillChip}>{sk.name}</Text>)}</View></>)}
        {cv.awards.length > 0 && (<><View style={s.section}><Text style={s.sectionTitle}>Awards</Text></View>{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
        {cv.certifications.length > 0 && (<><View style={s.section}><Text style={s.sectionTitle}>Certifications</Text></View>{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. EXECUTIVE — Two equal columns with colored section bars
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ExecutiveTemplate({ cv }: { cv: CvFull }) {
  const PURPLE = '#7c3aed'
  const s = StyleSheet.create({
    page: { fontSize: 10, fontFamily: 'Helvetica', color: '#1e1b4b' },
    header: { padding: 36, paddingBottom: 20, borderBottomWidth: 4, borderBottomColor: PURPLE },
    name: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: PURPLE },
    title: { fontSize: 12, color: '#6d28d9', marginTop: 3 },
    contactRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    contactItem: { fontSize: 9, color: '#7c3aed' },
    columns: { flexDirection: 'row', padding: 24, paddingTop: 16 },
    left: { width: '55%', paddingRight: 16 },
    right: { width: '45%', paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: '#e9d5ff' },
    sectionBar: { backgroundColor: PURPLE, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8, marginTop: 12 },
    sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 1 },
    entry: { marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
    date: { fontSize: 8.5, color: '#7c3aed' },
    subtitle: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
    desc: { fontSize: 9, color: '#4b5563', lineHeight: 1.5 },
    summary: { fontSize: 9.5, lineHeight: 1.6, color: '#4b5563' },
    skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    skillName: { fontSize: 9 },
    skillLevel: { fontSize: 8, color: PURPLE },
    footer: { position: 'absolute', bottom: 16, left: 36, right: 36, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  const SBar = ({ title }: { title: string }) => <View style={s.sectionBar}><Text style={s.sectionTitle}>{title}</Text></View>
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.name}>{getName(cv)}</Text>
          {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
          <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  |  ' : ''}{c}</Text>)}</View>
        </View>
        <View style={s.columns}>
          <View style={s.left}>
            {cv.profile.summary && (<><SBar title="Profile" /><Text style={s.summary}>{cv.profile.summary}</Text></>)}
            {cv.experiences.length > 0 && (<><SBar title="Experience" />{cv.experiences.map(e => (
              <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
            ))}</>)}
          </View>
          <View style={s.right}>
            {cv.education.length > 0 && (<><SBar title="Education" />{cv.education.map(e => (
              <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
            ))}</>)}
            {cv.skills.length > 0 && (<><SBar title="Skills" />{cv.skills.map(sk => (
              <View key={sk.id} style={s.skillRow}><Text style={s.skillName}>{sk.name}</Text></View>
            ))}</>)}
            {cv.awards.length > 0 && (<><SBar title="Awards" />{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
            {cv.certifications.length > 0 && (<><SBar title="Certifications" />{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
          </View>
        </View>
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. TIMELINE — Vertical line with markers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TimelineTemplate({ cv }: { cv: CvFull }) {
  const BLUE = '#0369a1'
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#0c4a6e' },
    name: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 3 },
    title: { fontSize: 11, color: '#0284c7', marginBottom: 8 },
    contactRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
    contactItem: { fontSize: 9, color: '#7dd3fc' },
    summary: { fontSize: 10, lineHeight: 1.6, color: '#475569', marginBottom: 16, paddingLeft: 20 },
    section: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff', backgroundColor: BLUE, paddingHorizontal: 10, paddingVertical: 4, marginTop: 14, marginBottom: 10 },
    timelineEntry: { flexDirection: 'row', marginBottom: 10 },
    timelineLeft: { width: 60, alignItems: 'flex-end', paddingRight: 12 },
    timelineLine: { width: 2, backgroundColor: '#bae6fd', position: 'absolute', top: 0, bottom: 0, left: 66 },
    timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE, position: 'absolute', left: 63, top: 2 },
    timelineRight: { paddingLeft: 20, flex: 1 },
    dateText: { fontSize: 8, color: '#7dd3fc' },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: '#0c4a6e' },
    subtitle: { fontSize: 9, color: '#64748b', marginBottom: 2 },
    desc: { fontSize: 9, color: '#475569', lineHeight: 1.5 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingLeft: 20 },
    skillChip: { backgroundColor: '#e0f2fe', color: BLUE, fontSize: 9, fontFamily: 'Helvetica-Bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    footer: { position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  const TEntry = ({ date, title, sub, desc: d }: { date: string; title: string; sub?: string; desc?: string | null }) => (
    <View style={s.timelineEntry}>
      <View style={s.timelineLeft}><Text style={s.dateText}>{date}</Text></View>
      <View style={s.timelineDot} />
      <View style={s.timelineRight}><Text style={s.entryTitle}>{title}</Text>{sub && <Text style={s.subtitle}>{sub}</Text>}{d && <Text style={s.desc}>{d}</Text>}</View>
    </View>
  )
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{getName(cv)}</Text>
        {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
        <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  |  ' : ''}{c}</Text>)}</View>
        {cv.profile.summary && <Text style={s.summary}>{cv.profile.summary}</Text>}
        {cv.experiences.length > 0 && (<><Text style={s.section}>Experience</Text><View style={{ position: 'relative' }}><View style={s.timelineLine} />{cv.experiences.map(e => (
          <TEntry key={e.id} date={fmtDate(e.start_date)} title={e.job_title} sub={`${e.company_name}${e.location ? ` · ${e.location}` : ''}`} desc={e.description} />
        ))}</View></>)}
        {cv.education.length > 0 && (<><Text style={s.section}>Education</Text><View style={{ position: 'relative' }}><View style={s.timelineLine} />{cv.education.map(e => (
          <TEntry key={e.id} date={fmtDate(e.start_date)} title={`${e.degree}${e.field_of_study ? ` in ${e.field_of_study}` : ''}`} sub={e.institution} />
        ))}</View></>)}
        {cv.skills.length > 0 && (<><Text style={s.section}>Skills</Text><View style={s.skillsRow}>{cv.skills.map(sk => <Text key={sk.id} style={s.skillChip}>{sk.name}</Text>)}</View></>)}
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. MODULAR — Card/block based layout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ModularTemplate({ cv }: { cv: CvFull }) {
  const ORANGE = '#ea580c'
  const s = StyleSheet.create({
    page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica', color: '#1c1917', backgroundColor: '#fafaf9' },
    headerRow: { flexDirection: 'row', marginBottom: 16 },
    nameCard: { flex: 1, backgroundColor: ORANGE, padding: 20, borderRadius: 4 },
    contactCard: { flex: 1, backgroundColor: '#fff7ed', padding: 20, borderRadius: 4, marginLeft: 8 },
    name: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
    title: { fontSize: 10, color: '#fed7aa', marginTop: 3 },
    contactItem: { fontSize: 9, color: '#9a3412', marginBottom: 3 },
    card: { backgroundColor: '#ffffff', borderWidth: 0.5, borderColor: '#e7e5e4', borderRadius: 4, padding: 16, marginBottom: 8 },
    cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: ORANGE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    cardUnderline: { width: 30, height: 2, backgroundColor: ORANGE, marginBottom: 10 },
    entry: { marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
    date: { fontSize: 8.5, color: '#78716c' },
    subtitle: { fontSize: 9, color: '#78716c', marginBottom: 2 },
    desc: { fontSize: 9, color: '#44403c', lineHeight: 1.5 },
    summary: { fontSize: 9.5, lineHeight: 1.6, color: '#44403c' },
    columns: { flexDirection: 'row' },
    colLeft: { flex: 3, marginRight: 8 },
    colRight: { flex: 2 },
    skillRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f4' },
    skillName: { fontSize: 9, color: '#44403c' },
    footer: { position: 'absolute', bottom: 16, left: 30, right: 30, textAlign: 'center', fontSize: 7, color: '#d6d3d1' },
  })
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={s.card}><Text style={s.cardTitle}>{title}</Text><View style={s.cardUnderline} />{children}</View>
  )
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={s.nameCard}><Text style={s.name}>{getName(cv)}</Text>{cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}</View>
          <View style={s.contactCard}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{c}</Text>)}</View>
        </View>
        {cv.profile.summary && <Card title="Profile"><Text style={s.summary}>{cv.profile.summary}</Text></Card>}
        <View style={s.columns}>
          <View style={s.colLeft}>
            {cv.experiences.length > 0 && <Card title="Experience">{cv.experiences.map(e => (
              <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)}</Text></View><Text style={s.subtitle}>{e.company_name}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
            ))}</Card>}
          </View>
          <View style={s.colRight}>
            {cv.education.length > 0 && <Card title="Education">{cv.education.map(e => (
              <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
            ))}</Card>}
            {cv.skills.length > 0 && <Card title="Skills">{cv.skills.map(sk => (
              <View key={sk.id} style={s.skillRow}><Text style={s.skillName}>{sk.name}</Text></View>
            ))}</Card>}
            {cv.certifications.length > 0 && <Card title="Certifications">{cv.certifications.map(c => (
              <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>
            ))}</Card>}
          </View>
        </View>
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. COMPACT — Three-panel header, dense layout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CompactTemplate({ cv }: { cv: CvFull }) {
  const GREEN = '#15803d'
  const s = StyleSheet.create({
    page: { fontSize: 10, fontFamily: 'Helvetica', color: '#14532d' },
    headerRow: { flexDirection: 'row', borderBottomWidth: 4, borderBottomColor: GREEN },
    headerPanel: { flex: 1, padding: 20 },
    headerDivider: { width: 1, backgroundColor: '#bbf7d0' },
    name: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: GREEN },
    title: { fontSize: 10, color: '#166534', marginTop: 3 },
    panelLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: '#86efac', marginBottom: 4 },
    panelText: { fontSize: 9, color: '#14532d', lineHeight: 1.4, marginBottom: 2 },
    body: { padding: 28 },
    section: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GREEN, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomStyle: 'dashed', borderBottomColor: '#bbf7d0' },
    entry: { marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
    date: { fontSize: 8.5, color: '#4ade80' },
    subtitle: { fontSize: 9, color: '#166534', marginBottom: 2 },
    desc: { fontSize: 9, color: '#14532d', lineHeight: 1.5 },
    summary: { fontSize: 9.5, lineHeight: 1.6, color: '#166534' },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    skillChip: { backgroundColor: '#f0fdf4', color: GREEN, fontSize: 8.5, fontFamily: 'Helvetica-Bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 0.5, borderColor: '#bbf7d0' },
    footer: { position: 'absolute', bottom: 16, left: 28, right: 28, textAlign: 'center', fontSize: 7, color: '#d1d5db' },
  })
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={s.headerPanel}><Text style={s.name}>{getName(cv)}</Text>{cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}</View>
          <View style={s.headerDivider} />
          <View style={s.headerPanel}><Text style={s.panelLabel}>Contact</Text>{getContact(cv).map((c, i) => <Text key={i} style={s.panelText}>{c}</Text>)}</View>
          <View style={s.headerDivider} />
          <View style={s.headerPanel}><Text style={s.panelLabel}>Key Skills</Text>{cv.skills.slice(0, 5).map(sk => <Text key={sk.id} style={s.panelText}>{sk.name}</Text>)}</View>
        </View>
        <View style={s.body}>
          {cv.profile.summary && (<><Text style={s.section}>Profile</Text><Text style={s.summary}>{cv.profile.summary}</Text></>)}
          {cv.experiences.length > 0 && (<><Text style={s.section}>Experience</Text>{cv.experiences.map(e => (
            <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
          ))}</>)}
          {cv.education.length > 0 && (<><Text style={s.section}>Education</Text>{cv.education.map(e => (
            <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
          ))}</>)}
          {cv.skills.length > 0 && (<><Text style={s.section}>All Skills</Text><View style={s.skillsRow}>{cv.skills.map(sk => <Text key={sk.id} style={s.skillChip}>{sk.name}</Text>)}</View></>)}
          {cv.awards.length > 0 && (<><Text style={s.section}>Awards</Text>{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
          {cv.certifications.length > 0 && (<><Text style={s.section}>Certifications</Text>{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        </View>
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. ELEGANT — Serif typography, refined spacing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ElegantTemplate({ cv }: { cv: CvFull }) {
  const ROSE = '#be185d'
  const s = StyleSheet.create({
    page: { padding: 50, fontSize: 10.5, fontFamily: 'Times-Roman', color: '#1a1a1a' },
    name: { fontSize: 30, fontFamily: 'Times-Bold', textAlign: 'center', color: ROSE, marginBottom: 2 },
    title: { fontSize: 12, textAlign: 'center', color: '#9f1239', fontFamily: 'Times-Italic', marginBottom: 10 },
    contactRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: ROSE },
    contactItem: { fontSize: 9, color: '#9ca3af', fontFamily: 'Helvetica' },
    section: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10 },
    sectionLine: { flex: 1, height: 0.5, backgroundColor: '#fce7f3' },
    sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 2, color: ROSE, paddingHorizontal: 12 },
    entry: { marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    entryTitle: { fontFamily: 'Times-Bold', fontSize: 11 },
    date: { fontSize: 9, color: ROSE, fontFamily: 'Times-Italic' },
    subtitle: { fontSize: 10, color: '#6b7280', fontFamily: 'Times-Italic', marginBottom: 2 },
    desc: { fontSize: 10, color: '#4b5563', lineHeight: 1.65, fontFamily: 'Times-Roman' },
    summary: { fontSize: 10.5, lineHeight: 1.7, color: '#4b5563', textAlign: 'center', fontFamily: 'Times-Italic', paddingHorizontal: 20 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
    skillChip: { fontSize: 9, color: ROSE, fontFamily: 'Helvetica', borderWidth: 0.5, borderColor: '#fce7f3', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
    footer: { position: 'absolute', bottom: 20, left: 50, right: 50, textAlign: 'center', fontSize: 7, color: '#e5e5e5' },
  })
  const SHead = ({ title }: { title: string }) => (
    <View style={s.section}><View style={s.sectionLine} /><Text style={s.sectionTitle}>{title}</Text><View style={s.sectionLine} /></View>
  )
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{getName(cv)}</Text>
        {cv.profile.job_title && <Text style={s.title}>{cv.profile.job_title}</Text>}
        <View style={s.contactRow}>{getContact(cv).map((c, i) => <Text key={i} style={s.contactItem}>{i > 0 ? '  ·  ' : ''}{c}</Text>)}</View>
        {cv.profile.summary && (<><SHead title="Profile" /><Text style={s.summary}>{cv.profile.summary}</Text></>)}
        {cv.experiences.length > 0 && (<><SHead title="Experience" />{cv.experiences.map(e => (
          <View key={e.id} style={s.entry}><View style={s.row}><Text style={s.entryTitle}>{e.job_title}</Text><Text style={s.date}>{fmtDate(e.start_date)} — {e.is_current ? 'Present' : fmtDate(e.end_date)}</Text></View><Text style={s.subtitle}>{e.company_name}{e.location ? ` · ${e.location}` : ''}</Text>{e.description && <Text style={s.desc}>{e.description}</Text>}</View>
        ))}</>)}
        {cv.education.length > 0 && (<><SHead title="Education" />{cv.education.map(e => (
          <View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.degree}{e.field_of_study ? ` in ${e.field_of_study}` : ''}</Text><Text style={s.subtitle}>{e.institution}</Text></View>
        ))}</>)}
        {cv.skills.length > 0 && (<><SHead title="Skills" /><View style={s.skillsRow}>{cv.skills.map(sk => <Text key={sk.id} style={s.skillChip}>{sk.name}</Text>)}</View></>)}
        {cv.awards.length > 0 && (<><SHead title="Awards" />{cv.awards.map(a => <View key={a.id} style={s.entry}><Text style={s.entryTitle}>{a.title}</Text>{a.issuer && <Text style={s.subtitle}>{a.issuer}</Text>}</View>)}</>)}
        {cv.certifications.length > 0 && (<><SHead title="Certifications" />{cv.certifications.map(c => <View key={c.id} style={s.entry}><Text style={s.entryTitle}>{c.name}</Text>{c.issuing_organization && <Text style={s.subtitle}>{c.issuing_organization}</Text>}</View>)}</>)}
        <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
      </Page>
    </Document>
  )
}
