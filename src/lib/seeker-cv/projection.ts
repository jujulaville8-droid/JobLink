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
  'spa attendant', 'spa therapist', 'massage therapist', 'chef de partie', 'sous chef',
  'head chef', 'executive chef', 'line cook', 'prep cook', 'kitchen helper', 'kitchen porter',
  'dishwasher', 'barista', 'host', 'hostess', 'concierge', 'bell attendant', 'pool attendant',
  'lifeguard', 'security officer', 'security guard', 'tour guide', 'driver', 'delivery driver',
  'sales representative', 'sales associate', 'store supervisor', 'shift supervisor',
  'restaurant manager', 'housekeeping supervisor', 'maintenance worker', 'groundskeeper',
  'landscaper', 'gardener', 'nail technician', 'hair stylist',
  'deckhand', 'activities coordinator', 'pump attendant',
])

// These extension aliases are CV-projection only; screening's vocabulary stays unchanged.
const skillAliases = new Map(Object.entries({
  'culinary arts': 'Culinary arts', 'food prep': 'Food preparation',
  'customer service skills': 'Customer service', 'customer care': 'Customer service',
  'cash handling skills': 'Cash handling', 'computer skills': 'Digital proficiency',
  'computer literacy': 'Digital proficiency', 'microsoft office suite': 'Microsoft Office',
  'communication skills': 'Communication', 'team work': 'Teamwork',
  'time management skills': 'Time management', 'problem-solving': 'Problem solving',
  'organisational skills': 'Organisation', 'organizational skills': 'Organisation',
  'massage therapy': 'Massage therapy', 'spa treatments': 'Spa treatments',
  'body treatments': 'Spa treatments', 'baking': 'Baking',
  'food and beverage service': 'Restaurant service', 'front desk': 'Guest reception',
  'room service': 'Restaurant service', 'data entry skills': 'Data entry',
  'driving': 'Driving', 'forklift operation': 'Forklift operation', 'forklift': 'Forklift operation',
  'customer service excellence': 'Customer service', 'guest relations': 'Customer relations',
  'client care': 'Customer service', 'food safety': 'Food safety',
  'cosmetology': 'Cosmetology', 'team collaboration': 'Teamwork',
}))
const roleAliases = new Map(Object.entries({
  'professional chef': 'chef', 'head cook': 'cook',
  'customer service rep': 'customer service representative',
  'customer service agent': 'customer service representative',
  'front desk clerk': 'front desk agent', 'wait staff': 'server',
  'food and beverage server': 'server', 'cocktail server': 'server',
}))
const skillHeading = /^(?:skills|technical skills|core skills|key skills|professional skills|areas of expertise|core competencies|competencies|qualifications):?$/i
const employmentHeading = /^(?:experience|work experience|professional experience|employment history|work history|career history):?$/i
const otherHeading = /^(?:education|references|summary|objective|career objective|profile|projects|certifications|interests|languages|awards|contact|personal details|training):?$/i
const unsafeSkillLine = /\b(?:not|no experience|never|seeking|aspiring|desired|required|requirement|supervisor|colleague|coworker|manager['’]s|duties|responsible for|including)\b/i
const unsafeSkillSegment = /\b(?:responsible|duties|worked|provided|assisted|managed|handled|performed)\b/i
const unsafeRoleLine = /\b(?:seeking|aspiring|desired|objective|future|hypothetical|supervisor|colleague|coworker|never)\b|\bnot\s/i

function normaliseSegment(value: string) {
  return value.trim().replace(/^[-•*]\s*/, '').replace(/\.+$/, '').trim()
    .replace(/\s*\([^()]*\)$/, '').replace(/\)+$/, '').replace(/\.+$/, '').trim().replace(/\s+/g, ' ')
}

function skillLabel(value: string) {
  const direct = canonicalScreeningEvidence(value, 'skill')?.replace(/ experience$/, '') ??
    skillAliases.get(value.toLowerCase())
  if (direct) return direct
  // List items often carry a trailing generic suffix ("Problem-solving skills");
  // the bare phrase is the reviewed concept.
  const bare = value.toLowerCase().replace(/\s+skills?$/, '')
  if (bare === value.toLowerCase()) return undefined
  return canonicalScreeningEvidence(bare, 'skill')?.replace(/ experience$/, '') ??
    skillAliases.get(bare)
}

function listSkills(line: string) {
  const matches: string[][] = []
  const raws = line.split(/[|•·;,]/)
  // A parenthetical often enumerates the concrete skills ("Computer Skills
  // (Microsoft Word, Excel, POS Systems)"); extract its parts from the whole
  // line before comma splitting breaks the group apart.
  for (const inner of line.matchAll(/\(([^()]*)\)/g)) raws.push(...inner[1].split(/[,;&]/))
  for (const raw of raws) {
    const segment = normaliseSegment(raw)
    if (!segment || segment.split(' ').length > 6 || unsafeSkillSegment.test(segment)) continue
    // "&" and "and" are interchangeable in list items ("Food & Beverage
    // Service" is the alias "food and beverage service").
    const whole = skillLabel(segment) ?? skillLabel(segment.replace(/\s*&\s*/g, ' and '))
    const labels = whole ? [whole] : segment.split(/&|\band\b/i)
      .map(part => skillLabel(normaliseSegment(part))).filter((label): label is string => !!label)
    if (labels.length) matches.push(labels)
  }
  return matches
}

function roleTitle(value: string) {
  return value.replace(/^(?:role|position|job title):\s*/, '')
    .replace(/\s*\([^()]*\)$/, '')
    .replace(/\s+(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?\d{4}\s*[-–]\s*(?:(?:[a-z]+\s+)?\d{4}|present|current)$/, '')
    .replace(/\s*\([^()]*\)$/, '').trim()
}

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
  // Local pages never escape this function; only closed-vocabulary labels do.
  let skillSection = false
  let employment = false
  for (const raw of extraction.localPages.join('\n').split('\n')) {
    const line = raw.trim().replace(/\s+/g, ' ')
    // Template bullets/decoration can precede a heading (".SKILLS", "•SKILLS").
    const headingLine = line.replace(/^[-•*. ]+/, '')
    if (skillHeading.test(headingLine) || employmentHeading.test(headingLine) || otherHeading.test(headingLine)) {
      skillSection = skillHeading.test(headingLine)
      // Objectives and training end employment, so their titles cannot become held roles.
      employment = employmentHeading.test(headingLine)
      continue
    }
    if ((skillSection || /[|•]/.test(line)) && !unsafeSkillLine.test(line)) {
      const matches = listSkills(line)
      if (skillSection || matches.flat().length >= 2) {
        for (const label of matches.flat()) skills.add(label)
      }
    }
    // Uncertainty elsewhere (including training, requirements, examples or copied text)
    // no longer vetoes roles. Attribution/uncertainty guards apply to the title line only.
    if (!employment || unsafeRoleLine.test(line)) continue
    const titleLine = line.toLowerCase().replace(/^[-•*]+\s*/, '')
    // Title lines pair a title with an employer, location or dates in either
    // order ("Spa Attendant | Bamboo Spa", "Save A Dollar – Sales Associate /
    // Cashier", "Waitress / Bartender"), so every separator segment and each
    // comma part of one is a candidate; only exact vocabulary matches land.
    const segments = titleLine.split(/ at | - | – | \| | \/ /)
    const candidates = new Set([titleLine, ...segments,
      ...segments.flatMap(segment => segment.split(/, /))])
    for (const candidate of candidates) {
      const title = roleTitle(candidate)
      const canonical = roles.has(title) ? title : roleAliases.get(title)
      if (canonical) heldRoles.add(canonical)
    }
  }
  return { cv_skills: [...skills].sort(), cv_roles: [...heldRoles].sort() }
}
