import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CvFull } from '@/lib/types'

const TEAL = '#0d7377'
const TEAL_LIGHT = '#e6f4f4'
const DARK = '#1a1a1a'
const GRAY = '#4b5563'
const LIGHT_GRAY = '#6b7280'
const BORDER = '#e5e7eb'

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: DARK,
    flexDirection: 'row',
  },
  // Left accent bar
  sidebar: {
    width: 6,
    backgroundColor: TEAL,
  },
  // Main content area
  main: {
    flex: 1,
    padding: 36,
    paddingLeft: 30,
  },
  // Header
  headerBlock: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
  },
  name: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    letterSpacing: 0.5,
  },
  jobTitle: {
    fontSize: 13,
    color: TEAL,
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
    color: LIGHT_GRAY,
    paddingRight: 8,
  },
  contactSep: {
    fontSize: 9,
    color: BORDER,
    paddingRight: 8,
  },
  // Summary
  summaryText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: GRAY,
    marginBottom: 4,
  },
  // Section
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  // Entry
  entry: {
    marginBottom: 10,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  entryTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    color: DARK,
    maxWidth: '75%',
  },
  entryDate: {
    fontSize: 9,
    color: LIGHT_GRAY,
    textAlign: 'right',
  },
  entrySubtitle: {
    fontSize: 9.5,
    color: GRAY,
    marginBottom: 2,
  },
  entryDesc: {
    fontSize: 9,
    color: GRAY,
    lineHeight: 1.55,
    marginTop: 3,
  },
  // Skills
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  skillChip: {
    backgroundColor: TEAL_LIGHT,
    color: TEAL,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  // Footer
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

function formatDate(d: string | null | undefined): string {
  if (!d) return 'Present'
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function createCvDocument(cv: CvFull) {
  return <CvDocument cv={cv} />
}

function CvDocument({ cv }: { cv: CvFull }) {
  const fullName = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Name'
  const contactParts = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Teal accent bar */}
        <View style={styles.sidebar} />

        <View style={styles.main}>
          {/* Header */}
          <View style={styles.headerBlock}>
            <Text style={styles.name}>{fullName}</Text>
            {cv.profile.job_title && (
              <Text style={styles.jobTitle}>{cv.profile.job_title}</Text>
            )}
            {contactParts.length > 0 && (
              <View style={styles.contactRow}>
                {contactParts.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Text style={styles.contactSep}>|</Text>}
                    <Text style={styles.contactItem}>{part}</Text>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>

          {/* Summary */}
          {cv.profile.summary && (
            <>
              <Text style={styles.sectionTitle}>Profile</Text>
              <Text style={styles.summaryText}>{cv.profile.summary}</Text>
            </>
          )}

          {/* Work Experience */}
          {cv.experiences.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Experience</Text>
              {cv.experiences.map((exp) => (
                <View key={exp.id} style={styles.entry}>
                  <View style={styles.entryRow}>
                    <Text style={styles.entryTitle}>{exp.job_title}</Text>
                    <Text style={styles.entryDate}>
                      {formatDate(exp.start_date)} — {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                    </Text>
                  </View>
                  <Text style={styles.entrySubtitle}>
                    {exp.company_name}{exp.location ? `  ·  ${exp.location}` : ''}
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
                  <View style={styles.entryRow}>
                    <Text style={styles.entryTitle}>
                      {edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                    </Text>
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
                  <View style={styles.entryRow}>
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
                  <View style={styles.entryRow}>
                    <Text style={styles.entryTitle}>{cert.name}</Text>
                    {cert.issue_date && <Text style={styles.entryDate}>{formatDate(cert.issue_date)}</Text>}
                  </View>
                  {cert.issuing_organization && <Text style={styles.entrySubtitle}>{cert.issuing_organization}</Text>}
                </View>
              ))}
            </>
          )}

          {/* Footer */}
          <Text style={styles.footer}>Built with JobLinks · joblinkantigua.com</Text>
        </View>
      </Page>
    </Document>
  )
}
