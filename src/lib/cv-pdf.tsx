import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CvFull } from '@/lib/types'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  header: { marginBottom: 20 },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  jobTitle: { fontSize: 12, color: '#555', marginBottom: 6 },
  contactRow: { flexDirection: 'row', gap: 12, fontSize: 9, color: '#666' },
  summary: { marginBottom: 16, lineHeight: 1.5, color: '#333' },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#222',
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  entrySubtitle: { fontSize: 9, color: '#555' },
  entryDate: { fontSize: 9, color: '#777' },
  entryDesc: { fontSize: 9, color: '#444', lineHeight: 1.5, marginTop: 2, marginBottom: 8 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 9,
    color: '#333',
  },
  entry: { marginBottom: 6 },
})

function formatDate(d: string | null | undefined): string {
  if (!d) return 'Present'
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function CvDocument({ cv }: { cv: CvFull }) {
  const fullName = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Name'
  const contactParts = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{fullName}</Text>
          {cv.profile.job_title && <Text style={styles.jobTitle}>{cv.profile.job_title}</Text>}
          <View style={styles.contactRow}>
            {contactParts.map((part, i) => (
              <Text key={i}>{part}</Text>
            ))}
          </View>
        </View>

        {/* Summary */}
        {cv.profile.summary && (
          <>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.summary}>{cv.profile.summary}</Text>
          </>
        )}

        {/* Work Experience */}
        {cv.experiences.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Work Experience</Text>
            {cv.experiences.map((exp) => (
              <View key={exp.id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{exp.job_title}</Text>
                  <Text style={styles.entryDate}>
                    {formatDate(exp.start_date)} — {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                  </Text>
                </View>
                <Text style={styles.entrySubtitle}>
                  {exp.company_name}{exp.location ? ` · ${exp.location}` : ''}
                </Text>
                {exp.description && <Text style={styles.entryDesc}>{exp.description}</Text>}
              </View>
            ))}
          </>
        )}

        {/* Education */}
        {cv.education.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Education</Text>
            {cv.education.map((edu) => (
              <View key={edu.id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}</Text>
                  {edu.start_date && (
                    <Text style={styles.entryDate}>
                      {formatDate(edu.start_date)} — {edu.is_current ? 'Present' : formatDate(edu.end_date)}
                    </Text>
                  )}
                </View>
                <Text style={styles.entrySubtitle}>{edu.institution}</Text>
                {edu.description && <Text style={styles.entryDesc}>{edu.description}</Text>}
              </View>
            ))}
          </>
        )}

        {/* Skills */}
        {cv.skills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {cv.skills.map((skill) => (
                <Text key={skill.id} style={styles.skillChip}>{skill.name}</Text>
              ))}
            </View>
          </>
        )}

        {/* Awards */}
        {cv.awards.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Awards</Text>
            {cv.awards.map((award) => (
              <View key={award.id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{award.title}</Text>
                  {award.date_received && <Text style={styles.entryDate}>{formatDate(award.date_received)}</Text>}
                </View>
                {award.issuer && <Text style={styles.entrySubtitle}>{award.issuer}</Text>}
                {award.description && <Text style={styles.entryDesc}>{award.description}</Text>}
              </View>
            ))}
          </>
        )}

        {/* Certifications */}
        {cv.certifications.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {cv.certifications.map((cert) => (
              <View key={cert.id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{cert.name}</Text>
                  {cert.issue_date && <Text style={styles.entryDate}>{formatDate(cert.issue_date)}</Text>}
                </View>
                {cert.issuing_organization && <Text style={styles.entrySubtitle}>{cert.issuing_organization}</Text>}
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  )
}
