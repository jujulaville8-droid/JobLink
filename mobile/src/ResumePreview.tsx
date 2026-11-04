import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { db } from './client'
import { C, Icon, Press, s } from './ui'

/**
 * In-app rendering of the JobLinks Resume, mirroring the website's resume
 * studio preview (src/components/cv/studio/ResumePreview.tsx): same paper
 * treatment, and the same content model as src/lib/resume-document.ts:
 * header (name, professional title, location / email / phone), then Summary,
 * Experience, Education, Skills, Certifications, Projects, Languages,
 * Volunteering, Awards, Memberships, References, skipping empty sections.
 */

export interface CvContact { first_name: string | null; last_name: string | null; phone: string | null; location: string | null; email: string }
interface ExpRow { company_name: string; job_title: string; location: string | null; start_date: string; end_date: string | null; is_current: boolean; description: string | null }
interface EduRow { institution: string; degree: string; field_of_study: string | null; start_date: string | null; end_date: string | null; is_current: boolean; description: string | null }
interface SkillRow { name: string }
interface CertRow { name: string; issuing_organization: string | null; issue_date: string | null; expiry_date: string | null }
interface ProjectRow { title: string; role: string | null; url: string | null; description: string | null; start_date: string | null; end_date: string | null }
interface LanguageRow { name: string; proficiency: string }
interface VolunteerRow { organization: string; role: string | null; description: string | null; start_date: string | null; end_date: string | null; is_current: boolean }
interface AwardRow { title: string; issuer: string | null; date_received: string | null; description: string | null }
interface MembershipRow { organization: string; role: string | null; year_joined: string | null }
interface ReferenceRow { name: string; title: string | null; company: string | null; phone: string | null; email: string | null; relationship: string | null }

export interface CvData {
  jobTitle: string | null
  summary: string | null
  completion: number
  contact: CvContact
  experiences: ExpRow[]
  education: EduRow[]
  skills: SkillRow[]
  certifications: CertRow[]
  projects: ProjectRow[]
  languages: LanguageRow[]
  volunteer: VolunteerRow[]
  awards: AwardRow[]
  memberships: MembershipRow[]
  references: ReferenceRow[]
}

const SECTION_TABLES = [
  ['experiences', 'cv_work_experiences'],
  ['education', 'cv_education'],
  ['skills', 'cv_skills'],
  ['certifications', 'cv_certifications'],
  ['projects', 'cv_projects'],
  ['languages', 'cv_languages'],
  ['volunteer', 'cv_volunteer'],
  ['awards', 'cv_awards'],
  ['memberships', 'cv_memberships'],
  ['references', 'cv_references'],
] as const

/** Loads the signed-in user's built resume. Returns null when none exists or it cannot be read; never throws. */
export async function loadResume(userId: string, contact: CvContact): Promise<CvData | null> {
  try {
    const profile = await db.from('cv_profiles').select('id,job_title,summary,completion_percentage').eq('user_id', userId).maybeSingle()
    if (profile.error || !profile.data) return null
    const cvProfile = profile.data
    const entries = await Promise.all(SECTION_TABLES.map(async ([key, table]) => {
      const result = await db.from(table).select('*').eq('cv_profile_id', cvProfile.id).order('sort_order')
      return [key, result.error ? [] : (result.data ?? [])] as const
    }))
    const byKey = Object.fromEntries(entries) as Record<string, unknown[]>
    return {
      jobTitle: cvProfile.job_title ?? null,
      summary: cvProfile.summary ?? null,
      completion: cvProfile.completion_percentage ?? 0,
      contact,
      experiences: byKey.experiences as ExpRow[],
      education: byKey.education as EduRow[],
      skills: byKey.skills as SkillRow[],
      certifications: byKey.certifications as CertRow[],
      projects: byKey.projects as ProjectRow[],
      languages: byKey.languages as LanguageRow[],
      volunteer: byKey.volunteer as VolunteerRow[],
      awards: byKey.awards as AwardRow[],
      memberships: byKey.memberships as MembershipRow[],
      references: byKey.references as ReferenceRow[],
    }
  } catch { return null }
}

// Content model, ported from src/lib/resume-document.ts (same order, same formatting).
export interface ResumeEntry { title: string; subtitle?: string; dates?: string; detail?: string }
export interface ResumeSection { key: string; title: string; entries: ResumeEntry[] }
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function resumeDate(value?: string | null) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})/.exec(value)
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${months[Number(match[2]) - 1]} ${match[1]}` : value
}
const join = (...values: (string | null | undefined)[]) => values.filter(Boolean).join(' · ')
const range = (start: string | null, end: string | null, current = false) => [resumeDate(start), current ? 'Present' : resumeDate(end)].filter(Boolean).join(' – ')

export function resumeSections(cv: CvData): ResumeSection[] {
  return [
    { key: 'summary', title: 'Summary', entries: cv.summary ? [{ title: '', detail: cv.summary }] : [] },
    { key: 'experiences', title: 'Experience', entries: cv.experiences.map(e => ({ title: e.job_title, subtitle: join(e.company_name, e.location), dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'education', title: 'Education', entries: cv.education.map(e => ({ title: join(e.degree, e.field_of_study), subtitle: e.institution, dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'skills', title: 'Skills', entries: cv.skills.length ? [{ title: '', detail: cv.skills.map(x => x.name).join(' · ') }] : [] },
    { key: 'certifications', title: 'Certifications', entries: cv.certifications.map(e => ({ title: e.name, subtitle: e.issuing_organization ?? '', dates: join(resumeDate(e.issue_date), e.expiry_date ? `Expires ${resumeDate(e.expiry_date)}` : '') })) },
    { key: 'projects', title: 'Projects', entries: cv.projects.map(e => ({ title: e.title, subtitle: join(e.role, e.url), dates: range(e.start_date, e.end_date), detail: e.description ?? '' })) },
    { key: 'languages', title: 'Languages', entries: cv.languages.map(e => ({ title: e.name, subtitle: e.proficiency })) },
    { key: 'volunteer', title: 'Volunteering', entries: cv.volunteer.map(e => ({ title: e.organization, subtitle: e.role ?? '', dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'awards', title: 'Awards', entries: cv.awards.map(e => ({ title: e.title, subtitle: e.issuer ?? '', dates: resumeDate(e.date_received), detail: e.description ?? '' })) },
    { key: 'memberships', title: 'Memberships', entries: cv.memberships.map(e => ({ title: e.organization, subtitle: e.role ?? '', dates: e.year_joined ?? '' })) },
    { key: 'references', title: 'References', entries: cv.references.map(e => ({ title: e.name, subtitle: join(e.title, e.company, e.relationship), detail: join(e.email, e.phone) })) },
  ].filter(section => section.entries.length > 0)
}

// Paper styling, mirroring the web sheet: white page, Georgia name and
// section heads, teal rule under the header, document greys.
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' })
const INK = '#242B2A'
const paper = StyleSheet.create({
  sheet: { backgroundColor: C.white, borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 22, paddingVertical: 26, shadowColor: '#263B29', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  header: { alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1.5, borderBottomColor: C.teal },
  name: { fontFamily: serif, fontSize: 21, lineHeight: 26, color: INK, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  role: { fontSize: 13.5, color: INK, marginTop: 4, textAlign: 'center' },
  contactLine: { fontSize: 11, lineHeight: 15, color: '#54605D', marginTop: 6, textAlign: 'center' },
  section: { marginTop: 18 },
  sectionTitle: { fontFamily: serif, fontWeight: 'bold', fontSize: 12.5, color: INK, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 8 },
  entry: { marginBottom: 10 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  entryTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: INK },
  entryDates: { fontSize: 11, color: '#56645D' },
  entrySubtitle: { fontSize: 12, lineHeight: 17, color: '#4D5954', marginTop: 1 },
  entryDetail: { fontSize: 12, lineHeight: 19, color: INK, marginTop: 2 },
  emptyTitle: { fontFamily: serif, fontSize: 18, color: '#4A655E', textAlign: 'center', marginTop: 24 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: '#707E78', textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
})

function SheetHeader({ cv }: { cv: CvData }) {
  const name = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Your name'
  const contactLine = [cv.contact.location, cv.contact.email, cv.contact.phone].filter(Boolean).join(' · ')
  return <View style={paper.header}>
    <Text style={paper.name}>{name}</Text>
    {!!cv.jobTitle && <Text style={paper.role}>{cv.jobTitle}</Text>}
    {!!contactLine && <Text style={paper.contactLine}>{contactLine}</Text>}
  </View>
}
function SheetEntry({ entry, detailLines }: { entry: ResumeEntry; detailLines?: number }) {
  return <View style={paper.entry}>
    {(!!entry.title || !!entry.dates) && <View style={paper.entryHead}>
      {!!entry.title && <Text style={paper.entryTitle}>{entry.title}</Text>}
      {!!entry.dates && <Text style={paper.entryDates}>{entry.dates}</Text>}
    </View>}
    {!!entry.subtitle && <Text style={paper.entrySubtitle}>{entry.subtitle}</Text>}
    {!!entry.detail && <Text style={paper.entryDetail} numberOfLines={detailLines}>{entry.detail}</Text>}
  </View>
}
function SheetSection({ section, maxEntries, detailLines }: { section: ResumeSection; maxEntries?: number; detailLines?: number }) {
  const entries = maxEntries ? section.entries.slice(0, maxEntries) : section.entries
  return <View style={paper.section}>
    <Text style={paper.sectionTitle}>{section.title}</Text>
    {entries.map((entry, i) => <SheetEntry key={i} entry={entry} detailLines={detailLines} />)}
  </View>
}

/** The complete resume as a paper sheet, used by the full-screen view. */
export function ResumeSheet({ cv }: { cv: CvData }) {
  const sections = resumeSections(cv)
  return <View style={paper.sheet}>
    <SheetHeader cv={cv} />
    {sections.length ? sections.map(section => <SheetSection key={section.key} section={section} />)
      : <><Text style={paper.emptyTitle}>Your story starts here.</Text>
        <Text style={paper.emptyBody}>Add a summary, experience, or skills to see your resume take shape.</Text></>}
  </View>
}

/**
 * The clipped preview for the Resume tab: the same sheet, cut short with a
 * fade, showing the header, a summary excerpt, the first experience entries,
 * and the skills line.
 */
export function ResumePreviewCard({ cv }: { cv: CvData }) {
  const sections = resumeSections(cv)
  const summary = sections.find(x => x.key === 'summary')
  const experience = sections.find(x => x.key === 'experiences')
  const education = sections.find(x => x.key === 'education')
  const skills = sections.find(x => x.key === 'skills')
  return <View style={[paper.sheet, { height: 330, overflow: 'hidden' }]}>
    <SheetHeader cv={cv} />
    {sections.length ? <>
      {summary && <SheetSection section={summary} detailLines={4} />}
      {experience && <SheetSection section={experience} maxEntries={2} detailLines={2} />}
      {!experience && education && <SheetSection section={education} maxEntries={1} detailLines={2} />}
      {skills && <SheetSection section={skills} detailLines={1} />}
    </> : <><Text style={paper.emptyTitle}>Your story starts here.</Text>
      <Text style={paper.emptyBody}>Add a summary, experience, or skills to see your resume take shape.</Text></>}
    {/* Fade: stacked white strips, since the app has no gradient library. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {[0.06, 0.22, 0.42, 0.64, 0.85, 0.97].map((opacity, i) => <View key={i} style={{ height: 11, backgroundColor: `rgba(255,255,255,${opacity})` }} />)}
    </View>
  </View>
}

/** Full-screen, scrollable rendering of the complete built resume. */
export function ResumeFullModal({ cv, visible, onClose, onEdit }: { cv: CvData; visible: boolean; onClose: () => void; onEdit: () => void }) {
  const insets = useSafeAreaInsets()
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'space-between' }]}>
        <Press accessibilityLabel="Close resume preview" onPress={onClose} style={{ padding: 11 }}><Icon name="close" /></Press>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>JobLinks Resume</Text>
        <Press accessibilityLabel="Edit your resume on the website" onPress={onEdit} style={{ padding: 11 }}><Text style={{ color: C.bright, fontWeight: '600', fontSize: 15 }}>Edit</Text></Press>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}>
        <ResumeSheet cv={cv} />
        <Text style={[s.small, { textAlign: 'center', marginTop: 16 }]}>To change anything here, edit your resume on the JobLinks website.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>
}
