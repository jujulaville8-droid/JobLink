import type { PdfResumeExtraction } from '../employer-screening/pdf-extraction'
import { canonicalScreeningEvidence } from '../employer-screening/privacy'

// Closed professional title vocabulary, matching screening's inert role metadata.
// Never persist arbitrary role lines, employers, locations, dates or descriptions.
const roles = new Set([
  'front desk assistant', 'front desk agent', 'receptionist', 'guest service agent', 'reservation agent',
  'hotel receptionist', 'customer service representative', 'customer service assistant', 'cashier',
  'sales assistant', 'store clerk', 'stock clerk', 'warehouse assistant', 'inventory clerk',
  'waiter', 'waitress', 'server', 'restaurant server', 'bartender', 'bar attendant', 'cook', 'chef',
  'kitchen assistant', 'housekeeper', 'room attendant', 'cleaner', 'housekeeping attendant',
  'office assistant', 'administrative assistant', 'administrative officer', 'office administrator',
  'clerk', 'data entry clerk', 'accounts clerk', 'bookkeeper', 'payroll officer', 'accounts assistant',
  'electrician', 'electrical assistant', 'electrical technician', 'plumber', 'plumbing assistant',
  'carpenter', 'carpentry assistant', 'mason', 'painter', 'maintenance technician', 'maintenance assistant',
  'hvac technician', 'refrigeration technician', 'construction worker', 'general labourer', 'general laborer',
  'apprentice electrician', 'apprentice plumber',
])

export function projectCv(extraction: PdfResumeExtraction) {
  const skills = new Set<string>()
  for (const item of extraction.evidence) {
    const q = item.qualifiers
    if (!q || q.attribution !== 'applicant' || q.assertion !== 'affirmed' ||
        !['performed', 'declaration'].includes(q.context) || item.category === 'job_certification') continue
    const label = canonicalScreeningEvidence(item.excerpt, item.category)
    if (label) skills.add(label.replace(/ experience$/, ''))
  }
  const heldRoles = new Set<string>()
  // Local pages never escape this function. Reject ambiguous attribution rather
  // than interpreting arbitrary prose or extracting a title out of a sentence.
  const pages = extraction.localPages.join('\n')
  const uncertain = /\b(?:not|no|never|supervisor|colleague|coworker|requirements?|objective|aspiring|desired|seeking|training|hypothetical|future|copied)\b/i.test(pages) || /(?:^|\n)\s*(?:example|sample)\b/i.test(pages)
  if (!uncertain) {
    let employment = false
    for (const raw of pages.split('\n')) {
      const line = raw.trim().toLowerCase()
      if (/^(?:experience|work experience|professional experience|employment history|work history|career history):?$/.test(line)) {
        employment = true
        continue
      }
      if (/^(?:skills|education|qualifications|references|summary|profile|projects|certifications|interests|languages|awards|contact|personal details):?$/.test(line)) employment = false
      const title = line.replace(/^role: /, '')
      if (employment && roles.has(title)) heldRoles.add(title)
    }
  }
  return { cv_skills: [...skills].sort(), cv_roles: [...heldRoles].sort() }
}
