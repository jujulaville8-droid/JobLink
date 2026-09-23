import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CvFull } from '@/lib/types';
import { resumeSections } from '@/lib/resume-document';

const styles = StyleSheet.create({
  page: { padding: 42, paddingBottom: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#202727', lineHeight: 1.5 },
  name: { fontFamily: 'Times-Roman', fontSize: 29, textAlign: 'center', lineHeight: 1.2 },
  title: { textAlign: 'center', fontSize: 12, marginTop: 5 },
  contact: { textAlign: 'center', fontSize: 9, color: '#526061', marginTop: 7, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#0d7377' },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 18, marginBottom: 7 },
  entry: { marginBottom: 9 },
  entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  secondary: { fontSize: 9, color: '#526061' },
  dates: { fontSize: 8.5, color: '#526061', marginBottom: 2 },
  detail: { fontSize: 9.5, marginTop: 2 },
  pageNumber: { position: 'absolute', bottom: 22, right: 42, fontSize: 8, color: '#526061' },
});

export function createResumeDocument(cv: CvFull) {
  return <Document title="Resume" author={[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ')}>
    <Page size="A4" style={styles.page}>
      <Text style={styles.name}>{[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Your name'}</Text>
      {cv.profile.job_title && <Text style={styles.title}>{cv.profile.job_title}</Text>}
      <Text style={styles.contact}>{[cv.contact.location, cv.contact.email, cv.contact.phone].filter(Boolean).join(' · ')}</Text>
      {resumeSections(cv).map(section => <React.Fragment key={section.key}>
        <Text style={styles.heading} minPresenceAhead={40}>{section.title}</Text>
        {section.entries.map((entry, index) => <View key={index} style={styles.entry}>
          {entry.title && <Text style={styles.entryTitle} minPresenceAhead={15}>{entry.title}</Text>}
          {entry.subtitle && <Text style={styles.secondary}>{entry.subtitle}</Text>}
          {entry.dates && <Text style={styles.dates}>{entry.dates}</Text>}
          {entry.detail && <Text style={styles.detail} orphans={2} widows={2}>{entry.detail}</Text>}
        </View>)}
      </React.Fragment>)}
      <Text style={styles.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>;
}
