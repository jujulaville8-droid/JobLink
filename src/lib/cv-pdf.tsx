import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CvFull } from '@/lib/types'

// ── Theme definitions ──────────────────────────────────────────────────

export type ThemeId =
  | 'classic'
  | 'modern'
  | 'bold'
  | 'minimal'
  | 'professional'
  | 'executive'
  | 'creative'
  | 'ocean'
  | 'sunset'
  | 'forest'

interface ThemeColors {
  primary: string
  primaryLight: string
  text: string
  textMuted: string
  textLight: string
  border: string
  sidebarWidth: number
  headerStyle: 'underline' | 'block' | 'none'
}

const THEMES: Record<ThemeId, ThemeColors> = {
  classic: {
    primary: '#1a1a1a',
    primaryLight: '#f3f4f6',
    text: '#1a1a1a',
    textMuted: '#4b5563',
    textLight: '#6b7280',
    border: '#d1d5db',
    sidebarWidth: 0,
    headerStyle: 'underline',
  },
  modern: {
    primary: '#0d7377',
    primaryLight: '#e6f4f4',
    text: '#1a1a1a',
    textMuted: '#4b5563',
    textLight: '#6b7280',
    border: '#e5e7eb',
    sidebarWidth: 6,
    headerStyle: 'underline',
  },
  bold: {
    primary: '#dc2626',
    primaryLight: '#fef2f2',
    text: '#111827',
    textMuted: '#374151',
    textLight: '#6b7280',
    border: '#e5e7eb',
    sidebarWidth: 8,
    headerStyle: 'block',
  },
  minimal: {
    primary: '#525252',
    primaryLight: '#fafafa',
    text: '#262626',
    textMuted: '#525252',
    textLight: '#a3a3a3',
    border: '#e5e5e5',
    sidebarWidth: 0,
    headerStyle: 'none',
  },
  professional: {
    primary: '#1e3a5f',
    primaryLight: '#eff6ff',
    text: '#1e293b',
    textMuted: '#475569',
    textLight: '#64748b',
    border: '#cbd5e1',
    sidebarWidth: 4,
    headerStyle: 'underline',
  },
  executive: {
    primary: '#7c3aed',
    primaryLight: '#f5f3ff',
    text: '#1e1b4b',
    textMuted: '#4c1d95',
    textLight: '#7c3aed',
    border: '#e9d5ff',
    sidebarWidth: 6,
    headerStyle: 'block',
  },
  creative: {
    primary: '#ea580c',
    primaryLight: '#fff7ed',
    text: '#1c1917',
    textMuted: '#44403c',
    textLight: '#78716c',
    border: '#e7e5e4',
    sidebarWidth: 10,
    headerStyle: 'block',
  },
  ocean: {
    primary: '#0369a1',
    primaryLight: '#e0f2fe',
    text: '#0c4a6e',
    textMuted: '#0369a1',
    textLight: '#7dd3fc',
    border: '#bae6fd',
    sidebarWidth: 5,
    headerStyle: 'underline',
  },
  sunset: {
    primary: '#be185d',
    primaryLight: '#fdf2f8',
    text: '#1a1a1a',
    textMuted: '#6b7280',
    textLight: '#9ca3af',
    border: '#fce7f3',
    sidebarWidth: 6,
    headerStyle: 'underline',
  },
  forest: {
    primary: '#15803d',
    primaryLight: '#f0fdf4',
    text: '#14532d',
    textMuted: '#166534',
    textLight: '#4ade80',
    border: '#bbf7d0',
    sidebarWidth: 5,
    headerStyle: 'underline',
  },
}

export const THEME_LIST: { id: ThemeId; name: string; color: string }[] = [
  { id: 'classic', name: 'Classic', color: '#1a1a1a' },
  { id: 'modern', name: 'Modern', color: '#0d7377' },
  { id: 'bold', name: 'Bold', color: '#dc2626' },
  { id: 'minimal', name: 'Minimal', color: '#525252' },
  { id: 'professional', name: 'Professional', color: '#1e3a5f' },
  { id: 'executive', name: 'Executive', color: '#7c3aed' },
  { id: 'creative', name: 'Creative', color: '#ea580c' },
  { id: 'ocean', name: 'Ocean', color: '#0369a1' },
  { id: 'sunset', name: 'Sunset', color: '#be185d' },
  { id: 'forest', name: 'Forest', color: '#15803d' },
]

// ── Styles factory ─────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    page: {
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: t.text,
      flexDirection: 'row',
    },
    sidebar: {
      width: t.sidebarWidth,
      backgroundColor: t.primary,
    },
    main: {
      flex: 1,
      padding: 36,
      paddingLeft: t.sidebarWidth > 0 ? 30 : 36,
    },
    headerBlock: {
      marginBottom: 20,
      paddingBottom: t.headerStyle === 'none' ? 10 : 16,
      ...(t.headerStyle === 'underline'
        ? { borderBottomWidth: 2, borderBottomColor: t.primary }
        : {}),
      ...(t.headerStyle === 'block'
        ? { backgroundColor: t.primaryLight, padding: 16, borderRadius: 4, marginLeft: -12, marginRight: -12, paddingLeft: 12 }
        : {}),
    },
    name: {
      fontSize: 26,
      fontFamily: 'Helvetica-Bold',
      color: t.headerStyle === 'block' ? t.primary : t.text,
      letterSpacing: 0.5,
    },
    jobTitle: {
      fontSize: 13,
      color: t.primary,
      fontFamily: 'Helvetica-Bold',
      marginTop: 4,
    },
    contactRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 10,
    },
    contactItem: {
      fontSize: 9,
      color: t.textLight,
      paddingRight: 8,
    },
    contactSep: {
      fontSize: 9,
      color: t.border,
      paddingRight: 8,
    },
    summaryText: {
      fontSize: 10,
      lineHeight: 1.6,
      color: t.textMuted,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: t.primary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 18,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    entry: { marginBottom: 10 },
    entryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 1,
    },
    entryTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 10.5,
      color: t.text,
      maxWidth: '75%',
    },
    entryDate: {
      fontSize: 9,
      color: t.textLight,
      textAlign: 'right',
    },
    entrySubtitle: {
      fontSize: 9.5,
      color: t.textMuted,
      marginBottom: 2,
    },
    entryDesc: {
      fontSize: 9,
      color: t.textMuted,
      lineHeight: 1.55,
      marginTop: 3,
    },
    skillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    skillChip: {
      backgroundColor: t.primaryLight,
      color: t.primary,
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 36,
      right: 36,
      textAlign: 'center',
      fontSize: 7,
      color: '#d1d5db',
    },
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return 'Present'
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ── Document ────────────────────────────────────────────────────────────

export function createCvDocument(cv: CvFull, theme: ThemeId = 'modern') {
  return <CvDocument cv={cv} theme={theme} />
}

function CvDocument({ cv, theme }: { cv: CvFull; theme: ThemeId }) {
  const t = THEMES[theme] || THEMES.modern
  const s = createStyles(t)
  const fullName = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Name'
  const contactParts = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {t.sidebarWidth > 0 && <View style={s.sidebar} />}

        <View style={s.main}>
          {/* Header */}
          <View style={s.headerBlock}>
            <Text style={s.name}>{fullName}</Text>
            {cv.profile.job_title && (
              <Text style={s.jobTitle}>{cv.profile.job_title}</Text>
            )}
            {contactParts.length > 0 && (
              <View style={s.contactRow}>
                {contactParts.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Text style={s.contactSep}>|</Text>}
                    <Text style={s.contactItem}>{part}</Text>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>

          {/* Summary */}
          {cv.profile.summary && (
            <>
              <Text style={s.sectionTitle}>Profile</Text>
              <Text style={s.summaryText}>{cv.profile.summary}</Text>
            </>
          )}

          {/* Work Experience */}
          {cv.experiences.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Experience</Text>
              {cv.experiences.map((exp) => (
                <View key={exp.id} style={s.entry}>
                  <View style={s.entryRow}>
                    <Text style={s.entryTitle}>{exp.job_title}</Text>
                    <Text style={s.entryDate}>
                      {formatDate(exp.start_date)} — {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                    </Text>
                  </View>
                  <Text style={s.entrySubtitle}>
                    {exp.company_name}{exp.location ? `  ·  ${exp.location}` : ''}
                  </Text>
                  {exp.description && <Text style={s.entryDesc}>{exp.description}</Text>}
                </View>
              ))}
            </>
          )}

          {/* Education */}
          {cv.education.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Education</Text>
              {cv.education.map((edu) => (
                <View key={edu.id} style={s.entry}>
                  <View style={s.entryRow}>
                    <Text style={s.entryTitle}>
                      {edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                    </Text>
                    {edu.start_date && (
                      <Text style={s.entryDate}>
                        {formatDate(edu.start_date)} — {edu.is_current ? 'Present' : formatDate(edu.end_date)}
                      </Text>
                    )}
                  </View>
                  <Text style={s.entrySubtitle}>{edu.institution}</Text>
                  {edu.description && <Text style={s.entryDesc}>{edu.description}</Text>}
                </View>
              ))}
            </>
          )}

          {/* Skills */}
          {cv.skills.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Skills</Text>
              <View style={s.skillsRow}>
                {cv.skills.map((skill) => (
                  <Text key={skill.id} style={s.skillChip}>{skill.name}</Text>
                ))}
              </View>
            </>
          )}

          {/* Awards */}
          {cv.awards.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Awards</Text>
              {cv.awards.map((award) => (
                <View key={award.id} style={s.entry}>
                  <View style={s.entryRow}>
                    <Text style={s.entryTitle}>{award.title}</Text>
                    {award.date_received && <Text style={s.entryDate}>{formatDate(award.date_received)}</Text>}
                  </View>
                  {award.issuer && <Text style={s.entrySubtitle}>{award.issuer}</Text>}
                  {award.description && <Text style={s.entryDesc}>{award.description}</Text>}
                </View>
              ))}
            </>
          )}

          {/* Certifications */}
          {cv.certifications.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Certifications</Text>
              {cv.certifications.map((cert) => (
                <View key={cert.id} style={s.entry}>
                  <View style={s.entryRow}>
                    <Text style={s.entryTitle}>{cert.name}</Text>
                    {cert.issue_date && <Text style={s.entryDate}>{formatDate(cert.issue_date)}</Text>}
                  </View>
                  {cert.issuing_organization && <Text style={s.entrySubtitle}>{cert.issuing_organization}</Text>}
                </View>
              ))}
            </>
          )}

          <Text style={s.footer}>Built with JobLinks · joblinkantigua.com</Text>
        </View>
      </Page>
    </Document>
  )
}
