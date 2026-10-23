/**
 * Conservative local vocabulary projection, NOT general NLP or a PII redactor.
 * Only whole reviewed declarations / task propositions are accepted. Unsupported
 * text is rejected rather than regex-redacted or forwarded to a model. Adding a
 * concept or proposition requires privacy and job-relevance review.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { captureSnapshot, readSnapshot, type Snapshot } from './index'
import { MAX_PUBLISHED_JOB_CRITERIA, validatePublishedCriterionText } from './inline-job-context'

type Category = Snapshot['rubric']['criteria'][number]['category']
type Concept = Readonly<{ label: string; category: Category; aliases: readonly string[] }>
const skills: readonly Concept[] = [
  { label: 'Spreadsheet skills', category: 'skill', aliases: ['spreadsheets', 'Maintain spreadsheet records'] },
  { label: 'Microsoft Excel', category: 'skill', aliases: ['Excel'] },
  { label: 'Google Sheets', category: 'skill', aliases: [] },
  { label: 'Customer service', category: 'skill', aliases: ['customer support'] },
  { label: 'Inventory management', category: 'skill', aliases: ['inventory control', 'stock control'] },
  { label: 'Data entry', category: 'skill', aliases: [] },
  { label: 'Bookkeeping', category: 'skill', aliases: [] },
  { label: 'Cash handling', category: 'skill', aliases: [] },
  { label: 'Point of sale systems', category: 'skill', aliases: ['POS systems'] },
  { label: 'Food preparation', category: 'skill', aliases: [] },
  { label: 'Housekeeping', category: 'skill', aliases: [] },
  { label: 'Scheduling', category: 'skill', aliases: [] },
  { label: 'Microsoft Word', category: 'skill', aliases: [] },
  { label: 'Microsoft Office', category: 'skill', aliases: [] },
  { label: 'Typing', category: 'skill', aliases: [] },
  { label: 'Record keeping', category: 'skill', aliases: ['recordkeeping'] },
  { label: 'Communication', category: 'skill', aliases: [] },
  { label: 'Teamwork', category: 'skill', aliases: [] },
  { label: 'Time management', category: 'skill', aliases: [] },
  { label: 'Customer relations', category: 'skill', aliases: [] },
  { label: 'Sales', category: 'skill', aliases: [] },
  { label: 'Organisation', category: 'skill', aliases: ['organization'] },
  { label: 'Digital proficiency', category: 'skill', aliases: [] },
  { label: 'Problem solving', category: 'skill', aliases: [] },
  ...[
    'Guest reception', 'Reservations', 'Restaurant service', 'Bartending', 'Cleaning and sanitation',
    'Accounts payable', 'Accounts receivable', 'Payroll', 'Office administration', 'Document filing',
    'Electrical installation', 'Electrical maintenance', 'Plumbing installation', 'Plumbing repairs',
    'Carpentry', 'Masonry', 'Painting', 'Equipment maintenance', 'Air conditioning and refrigeration',
    'Construction site safety',
  ].map(label => ({ label, category: 'skill' as const, aliases: [] })),
]

// These are finite, reviewed positive propositions, not loose keyword searches.
// A task claim indicates applicant-reported work, not proficiency, duration,
// seniority, employment verification or authority to practise a regulated trade.
const professionalClaims = [
  { label: 'Customer service experience', claims: [
    'Provided customer service', 'Provided customer support', 'Assisted customers',
    'Answered customer enquiries', 'Answered customer inquiries', 'Resolved customer complaints',
    'Handled customer complaints', 'Responded to customer enquiries', 'Responded to customer inquiries',
    'Assisted guests with enquiries', 'Resolved guest complaints',
  ] },
  { label: 'Inventory management experience', claims: [
    'Managed inventory', 'Maintained inventory records', 'Maintained stock records', 'Tracked inventory levels',
    'Monitored stock levels', 'Conducted stock counts', 'Performed stock counts', 'Replenished stock',
    'Received and checked deliveries', 'Recorded incoming stock', 'Ordered supplies',
  ] },
  { label: 'Bookkeeping experience', claims: [
    'Performed bookkeeping', 'Maintained financial records', 'Reconciled bank statements',
    'Reconciled accounts', 'Recorded financial transactions', 'Maintained the general ledger',
    'Prepared monthly accounts', 'Balanced daily accounts',
  ] },
  { label: 'Guest reception experience', claims: [
    'Checked guests in and out', 'Handled guest check-in and check-out', 'Processed guest check-ins',
    'Processed guest check-outs', 'Welcomed guests at reception', 'Managed front desk operations',
    'Assisted guests with check-in and check-out',
  ] },
  { label: 'Reservations experience', claims: [
    'Managed reservations', 'Handled room reservations', 'Processed hotel bookings',
    'Confirmed guest reservations', 'Updated room availability', 'Managed restaurant reservations',
  ] },
  { label: 'Restaurant service experience', claims: [
    'Served food and beverages', 'Took customer orders', 'Took food and beverage orders',
    'Served guests in the restaurant', 'Set and cleared tables', 'Delivered room service orders',
  ] },
  { label: 'Bartending experience', claims: [
    'Prepared and served drinks', 'Mixed cocktails', 'Served beverages at the bar',
    'Maintained bar stock', 'Prepared cocktails',
  ] },
  { label: 'Food preparation experience', claims: [
    'Prepared meals', 'Prepared food', 'Prepared ingredients', 'Cooked meals',
    'Prepared meals according to recipes', 'Prepared food following food safety procedures',
    'Prepared meals according to food safety standards', 'Portioned food for service',
  ] },
  { label: 'Housekeeping experience', claims: [
    'Cleaned guest rooms', 'Prepared guest rooms', 'Changed bed linen', 'Replenished guest room supplies',
    'Cleaned rooms and public areas', 'Performed housekeeping duties', 'Inspected guest rooms',
  ] },
  { label: 'Cleaning and sanitation experience', claims: [
    'Cleaned and sanitised work areas', 'Cleaned and sanitized work areas', 'Sanitised food preparation areas',
    'Sanitized food preparation areas', 'Cleaned kitchen equipment', 'Followed cleaning schedules',
    'Cleaned offices', 'Disinfected surfaces',
  ] },
  { label: 'Cash handling experience', claims: [
    'Handled cash payments', 'Processed cash and card payments', 'Balanced the cash register',
    'Reconciled cash at the end of each shift', 'Counted cash at closing', 'Handled cash transactions',
  ] },
  { label: 'Point of sale experience', claims: [
    'Operated a point of sale system', 'Operated POS systems', 'Processed sales using a POS system',
    'Entered orders into the point of sale system',
  ] },
  { label: 'Data entry experience', claims: [
    'Entered data into spreadsheets', 'Entered customer records', 'Updated customer records',
    'Entered invoices into the system', 'Performed data entry', 'Updated database records',
  ] },
  { label: 'Spreadsheet record keeping experience', claims: [
    'Maintained spreadsheet records', 'Prepared reports in Microsoft Excel', 'Updated records in Microsoft Excel',
    'Used Microsoft Excel to maintain records', 'Maintained records in Google Sheets',
  ] },
  { label: 'Scheduling experience', claims: [
    'Scheduled appointments', 'Coordinated appointments', 'Managed appointment calendars',
    'Scheduled staff shifts', 'Prepared staff rosters', 'Coordinated meeting schedules',
  ] },
  { label: 'Office administration experience', claims: [
    'Performed office administration', 'Answered telephone calls', 'Managed office correspondence',
    'Prepared business correspondence', 'Prepared meeting minutes', 'Processed incoming mail',
  ] },
  { label: 'Document filing experience', claims: [
    'Filed documents', 'Maintained filing systems', 'Organised office files', 'Organized office files',
    'Maintained paper and electronic records', 'Archived business records',
  ] },
  { label: 'Accounts payable experience', claims: [
    'Processed supplier invoices', 'Maintained accounts payable records', 'Reconciled supplier accounts',
    'Prepared supplier payments',
  ] },
  { label: 'Accounts receivable experience', claims: [
    'Issued customer invoices', 'Maintained accounts receivable records', 'Tracked outstanding invoices',
    'Recorded customer payments',
  ] },
  { label: 'Payroll experience', claims: [
    'Processed payroll', 'Prepared payroll records', 'Calculated employee wages', 'Maintained payroll records',
  ] },
  { label: 'Electrical installation experience', claims: [
    'Installed electrical wiring', 'Installed lighting fixtures', 'Installed electrical outlets',
    'Assisted with electrical installation', 'Installed electrical conduit',
  ] },
  { label: 'Electrical maintenance experience', claims: [
    'Maintained electrical systems', 'Tested electrical circuits', 'Repaired electrical faults',
    'Inspected electrical equipment', 'Assisted with electrical maintenance',
  ] },
  { label: 'Plumbing installation experience', claims: [
    'Installed water pipes', 'Installed plumbing fixtures', 'Installed drainage pipes',
    'Assisted with plumbing installation', 'Fitted bathroom fixtures',
  ] },
  { label: 'Plumbing repairs experience', claims: [
    'Repaired leaking pipes', 'Repaired plumbing fixtures', 'Cleared blocked drains',
    'Maintained plumbing systems', 'Replaced damaged pipes',
  ] },
  { label: 'Carpentry experience', claims: [
    'Built wooden cabinets', 'Installed doors and windows', 'Constructed timber frames',
    'Measured and cut timber', 'Repaired wooden furniture', 'Installed wooden fittings',
  ] },
  { label: 'Masonry experience', claims: [
    'Laid concrete blocks', 'Laid bricks', 'Mixed mortar', 'Built block walls',
    'Plastered walls', 'Poured concrete',
  ] },
  { label: 'Painting experience', claims: [
    'Prepared surfaces for painting', 'Painted interior walls', 'Painted exterior walls',
    'Applied paint and protective coatings', 'Sanded and primed surfaces',
  ] },
  { label: 'Equipment maintenance experience', claims: [
    'Maintained mechanical equipment', 'Performed preventive maintenance', 'Repaired mechanical equipment',
    'Inspected machinery', 'Serviced tools and equipment', 'Maintained maintenance records',
  ] },
  { label: 'Air conditioning and refrigeration experience', claims: [
    'Installed air conditioning units', 'Serviced air conditioning units', 'Repaired refrigeration equipment',
    'Maintained refrigeration systems', 'Cleaned air conditioning filters',
  ] },
  { label: 'Construction site safety experience', claims: [
    'Conducted site safety checks', 'Inspected safety equipment', 'Followed construction site safety procedures',
    'Maintained a safe and tidy work area', 'Used personal protective equipment on site',
  ] },
] as const

// The presence of one of these statements is never independent verification.
// Dates, certificate numbers, named issuers, expired/pending status and other
// additions are deliberately unsupported, rather than stripped from a claim.
const credentialClaims = [
  { label: 'Food safety certification', claims: ['Food safety certificate', 'Certified in food safety', 'Hold a food safety certificate', 'Food handler certificate', 'Food handler certification'] },
  { label: 'First aid certification', claims: ['First aid certificate', 'Certified in first aid', 'Hold a first aid certificate', 'First aid certified'] },
  { label: 'CPR certification', claims: ['CPR certificate', 'Certified in CPR', 'Hold a CPR certificate', 'CPR certified'] },
  { label: 'Electrical installation certification', claims: ['Certificate in electrical installation', 'Electrical installation certificate', 'Certified in electrical installation'] },
  { label: 'Plumbing certification', claims: ['Plumbing certificate', 'Certificate in plumbing', 'Certified in plumbing'] },
  { label: 'Carpentry certification', claims: ['Carpentry certificate', 'Certificate in carpentry', 'Certified in carpentry'] },
  { label: 'Welding certification', claims: ['Welding certificate', 'Certificate in welding', 'Certified in welding'] },
  { label: 'Air conditioning and refrigeration certification', claims: ['Certificate in air conditioning and refrigeration', 'Certified in air conditioning and refrigeration'] },
  { label: 'Hospitality service certification', claims: ['Certificate in hospitality service', 'Hospitality service certificate', 'Certified in hospitality service'] },
  { label: 'Housekeeping certification', claims: ['Housekeeping certificate', 'Certificate in housekeeping', 'Certified in housekeeping'] },
  { label: 'Bookkeeping certification', claims: ['Bookkeeping certificate', 'Certificate in bookkeeping', 'Certified in bookkeeping'] },
] as const
const concepts: readonly Concept[] = [
  ...skills,
  ...professionalClaims.map(c => ({ label: c.label, category: 'relevant_experience' as const, aliases: [] })),
  ...credentialClaims.map(c => ({ label: c.label, category: 'job_certification' as const, aliases: [] })),
]
export const SCREENING_CRITERIA_CATALOG: readonly Readonly<{ label: string; category: Category }>[] = Object.freeze(
  concepts.map(({ label, category }) => Object.freeze({ label, category })),
)
export const SCREENING_SKILL_ALIASES: readonly string[] = Object.freeze(
  [...new Set(skills.flatMap(c => [c.label, ...c.aliases]))],
)
const key = (value: string) => value.toLowerCase()
// No Unicode normalization, transliteration, free-text redaction or substring
// matching. Even accepted statements consist entirely of reviewed ASCII words.
const wholeText = z.string().min(1).max(120).refine(s => s === s.trim() && /^[\x20-\x7e]+$/.test(s))
const lookup = (value: string, category: Category) => {
  if (!wholeText.safeParse(value).success) return undefined
  return concepts.find(c => c.category === category && [c.label, ...c.aliases].some(a => key(a) === key(value)))
}
export const screeningQualifiersSchema = z.object({
  attribution: z.enum(['applicant', 'other', 'unknown']),
  context: z.enum(['performed', 'declaration', 'training', 'requirement', 'unknown']),
  assertion: z.enum(['affirmed', 'negated', 'uncertain']),
  credentialStatus: z.enum(['not_applicable', 'claimed_attainment', 'claimed_current', 'expired', 'cancelled', 'in_progress', 'unknown']),
}).strict()
export type ScreeningEvidenceQualifiers = z.infer<typeof screeningQualifiersSchema>
type ReviewedClaim = Readonly<{ label: string; category: Category; qualifiers: ScreeningEvidenceQualifiers }>
const claimMap = new Map<string, ReviewedClaim>()
const baseQualifiers = (category: Category): ScreeningEvidenceQualifiers => ({
  attribution: 'applicant', context: category === 'relevant_experience' ? 'performed' : 'declaration',
  assertion: 'affirmed', credentialStatus: category === 'job_certification' ? 'claimed_attainment' : 'not_applicable',
})
const addClaim = (label: string, category: Category, text: string, changes: Partial<ScreeningEvidenceQualifiers> = {}) => {
  for (const suffix of ['', '.']) {
    const claimKey = `${category}:${key(text + suffix)}`
    const previous = claimMap.get(claimKey)
    if (previous && previous.label !== label) throw new Error('Ambiguous reviewed screening proposition')
    claimMap.set(claimKey, Object.freeze({ label, category, qualifiers: Object.freeze({ ...baseQualifiers(category), ...changes }) }))
  }
}
// Closed verb vocabulary, not arbitrary stemming or free-text normalization.
const infinitives: Readonly<Record<string, string>> = {
  provided: 'provide', assisted: 'assist', answered: 'answer', resolved: 'resolve', handled: 'handle',
  responded: 'respond', managed: 'manage', maintained: 'maintain', tracked: 'track', monitored: 'monitor',
  conducted: 'conduct', performed: 'perform', replenished: 'replenish', received: 'receive', checked: 'check',
  recorded: 'record', ordered: 'order', reconciled: 'reconcile', prepared: 'prepare', balanced: 'balance',
  processed: 'process', welcomed: 'welcome', confirmed: 'confirm', updated: 'update', served: 'serve',
  took: 'take', set: 'set', cleared: 'clear', delivered: 'deliver', mixed: 'mix', cooked: 'cook',
  portioned: 'portion', cleaned: 'clean', changed: 'change', inspected: 'inspect', sanitised: 'sanitise',
  sanitized: 'sanitize', followed: 'follow', disinfected: 'disinfect', counted: 'count', operated: 'operate',
  entered: 'enter', used: 'use', scheduled: 'schedule', coordinated: 'coordinate', filed: 'file',
  organised: 'organise', organized: 'organize', archived: 'archive', issued: 'issue', calculated: 'calculate',
  installed: 'install', tested: 'test', repaired: 'repair', fitted: 'fit', replaced: 'replace', built: 'build',
  constructed: 'construct', measured: 'measure', cut: 'cut', laid: 'lay', plastered: 'plaster', poured: 'pour',
  painted: 'paint', applied: 'apply', sanded: 'sand', primed: 'prime', serviced: 'service',
}
for (const concept of professionalClaims) for (const claim of concept.claims) {
  addClaim(concept.label, 'relevant_experience', claim)
  addClaim(concept.label, 'relevant_experience', `I ${claim}`)
  addClaim(concept.label, 'relevant_experience', `My supervisor ${claim}`, { attribution: 'other' })
  addClaim(concept.label, 'relevant_experience', `My colleague ${claim}`, { attribution: 'other' })
  const words = claim.toLowerCase().split(' ')
  if (!infinitives[words[0]]) throw new Error('Unreviewed professional verb')
  words[0] = infinitives[words[0]]
  for (let index = 1; index < words.length; index++) {
    if (words[index - 1] === 'and' && infinitives[words[index]]) words[index] = infinitives[words[index]]
  }
  const present = words.join(' ')
  addClaim(concept.label, 'relevant_experience', `I ${present}`)
  addClaim(concept.label, 'relevant_experience', present, { context: 'unknown', assertion: 'uncertain' })
  for (const prefix of ['Did not ', 'I did not ', 'Never ', 'I never ']) {
    addClaim(concept.label, 'relevant_experience', prefix + present, { assertion: 'negated' })
  }
  for (const prefix of ['Would ', 'I would ', 'Required to ', 'Expected to ']) {
    addClaim(concept.label, 'relevant_experience', prefix + present, { context: 'requirement', assertion: 'uncertain' })
  }
  for (const prefix of ['Trained to ', 'Training to ']) {
    addClaim(concept.label, 'relevant_experience', prefix + present, { context: 'training' })
  }
}
for (const concept of credentialClaims) for (const claim of [concept.label, ...concept.claims]) {
  addClaim(concept.label, 'job_certification', claim)
  addClaim(concept.label, 'job_certification', `I ${claim}`)
  if (!/^Hold /i.test(claim)) {
    addClaim(concept.label, 'job_certification', `Earned a ${claim}`)
    addClaim(concept.label, 'job_certification', `I earned a ${claim}`)
  }
  for (const status of ['expired', 'cancelled', 'canceled'] as const) {
    const credentialStatus = status === 'canceled' ? 'cancelled' : status
    addClaim(concept.label, 'job_certification', `${claim} ${status}`, { credentialStatus })
    addClaim(concept.label, 'job_certification', `${claim} (${status})`, { credentialStatus })
  }
  addClaim(concept.label, 'job_certification', `Pursuing ${claim}`, { credentialStatus: 'in_progress', context: 'training' })
  addClaim(concept.label, 'job_certification', `My supervisor holds ${claim}`, { attribution: 'other' })
  if (/certificate|certification/i.test(claim) && !/^Hold /i.test(claim)) {
    addClaim(concept.label, 'job_certification', `Current ${claim}`, { credentialStatus: 'claimed_current' })
    addClaim(concept.label, 'job_certification', `Hold a current ${claim}`, { credentialStatus: 'claimed_current' })
    addClaim(concept.label, 'job_certification', `I hold a current ${claim}`, { credentialStatus: 'claimed_current' })
  }
  if (/^Certified in /i.test(claim)) addClaim(concept.label, 'job_certification', `Currently ${claim}`, { credentialStatus: 'claimed_current' })
}
const lookupEvidence = (value: string, category: Category): ReviewedClaim | undefined => {
  if (!wholeText.safeParse(value).success) return undefined
  if (category !== 'skill') return claimMap.get(`${category}:${key(value)}`)
  const concept = lookup(value, category)
  return concept ? { ...concept, qualifiers: baseQualifiers(category) } : undefined
}
/** Canonical label only; exact reviewed membership, never category/substring similarity. */
export function canonicalScreeningConcept(value: string, category: Category): string | null {
  return (lookup(value, category) ?? lookupEvidence(value, category))?.label ?? null
}
/** Concept recognition is NOT affirmative evidence: callers must inspect qualifiers. */
export function canonicalScreeningEvidence(value: string, category: Category): string | null {
  return lookupEvidence(value, category)?.label ?? null
}
export function screeningEvidenceQualifiers(value: string, category: Category): ScreeningEvidenceQualifiers | null {
  const claim = lookupEvidence(value, category)
  return claim ? { ...claim.qualifiers } : null
}
/** Citation eligibility only for contextual rows; matching semantics remain an AI assessment. */
export function evidenceSupportsCriterion(
  criterion: Readonly<{ label: string; category: Category }>,
  evidence: Readonly<{ excerpt: string; category: Category; qualifiers?: ScreeningEvidenceQualifiers; interpretation?: 'ai_contextual' }>,
): boolean {
  const requirement = lookup(criterion.label, criterion.category)
  if (evidence.interpretation === 'ai_contextual') {
    const q = evidence.qualifiers
    return Boolean(requirement && requirement.category === evidence.category && isSafeProfessionalRecord(evidence.excerpt) &&
      (!q || (q.attribution === 'applicant' && q.assertion === 'affirmed' &&
        q.context === (evidence.category === 'relevant_experience' ? 'performed' : 'declaration') &&
        (evidence.category !== 'job_certification' || ['claimed_attainment', 'claimed_current'].includes(q.credentialStatus)))))
  }
  const claim = lookupEvidence(evidence.excerpt, evidence.category)
  if (!requirement || !claim || requirement.category !== claim.category || requirement.label !== claim.label) return false
  // Only legacy exact skill declarations may omit context. Non-skill source
  // identity alone never establishes who performed a task or current validity.
  if (!evidence.qualifiers) return evidence.category === 'skill'
  const eligible = (q: ScreeningEvidenceQualifiers) => q.attribution === 'applicant' && q.assertion === 'affirmed' &&
    q.context === (evidence.category === 'relevant_experience' ? 'performed' : 'declaration') &&
    (evidence.category !== 'job_certification' || (q.credentialStatus === 'claimed_current' || q.credentialStatus === 'claimed_attainment'))
  return eligible(claim.qualifiers) && eligible(evidence.qualifiers)
}
/** Whole-record professional-language gate, not a general-purpose PII redactor.
 * Unknown vocabulary causes the ENTIRE row to be omitted. The closed lexicon
 * permits varied professional narratives without forwarding arbitrary prose.
 * Homonyms/unsupported terminology remain a limitation, not anonymity proof. */
const professionalWords = new Set([
  ...concepts.flatMap(c => [c.label, ...c.aliases]),
  ...professionalClaims.flatMap(c => c.claims), ...credentialClaims.flatMap(c => c.claims),
].flatMap(value => value.toLowerCase().match(/[a-z]+/g) ?? []))
for (const word of `a an the i me my mine we us our ours you your they them their he she his her it its
this that these those each every all some any both either another other others same such
and or but nor so because while although though however therefore also then than as at by for from
in into on onto of off out over under to with within throughout during before after since until
is am are was were be been being have has had do does did doing done can cannot could would should
will may might must not no never only rather instead including includes included include such
work worked working works employment employed employee employees employer employers career careers
professional professionals experience experienced experiences role roles position positions duty duties
responsibility responsibilities responsible task tasks activity activities service services team teams
member members colleague colleagues coworker coworkers supervisor supervisors manager managers management
staff worker workers assistant assistants operator operators technician technicians apprentice apprentices
trained training train learnt learned learning practice practised practiced practical supervised supervision
requirement requirements required require requires future planned plan planning expected expectation
performed performing perform provide provides providing supplied supply supplying support supports supporting
assist assists assisting help helped helping handle handles handling maintain maintains maintaining
process processes processing manage manages managing coordinate coordinates coordinating schedule schedules
record records recording organize organizes organizing organized organise organises organising organised
prepare prepares preparing resolve resolves resolving respond responds responding answer answers answering
welcome welcomes welcoming explain explains explained explaining communicate communicates communicated communicating
ensure ensures ensured ensuring follow follows following check checks checking monitor monitors monitoring
receive receives receiving deliver delivers delivering report reports reporting review reviews reviewed reviewing
repair repairs repairing install installs installing inspect inspects inspecting test tests testing
clean cleans cleaning cook cooks cooking serve serves serving book booked booking bookings reserve reserved
arrange arranged arranging allocate allocated allocating confirm confirms confirming complete completed completing
verify verified verifying count counts counting reconcile reconciles reconciling balance balances balancing
calculate calculates calculating enter enters entering update updates updating use uses using operate operates
operating conduct conducts conducting build builds building cut cuts cutting measure measures measuring
paint paints painting mix mixes mixing lay lays laying fit fits fitting replace replaces replacing
service services servicing stock stocks stocking replenish replenishes replenishing replenish track tracks tracking
issue issues issuing invoice invoices invoicing purchase purchases purchasing order orders ordering
control controls controlling dispatch dispatched dispatching pack packed packing unload unloaded unloading
load loaded loading sort sorted sorting distribute distributed distributing collect collected collecting
receive receipt receipts refund refunds refunded exchange exchanges exchanged transaction transactions
sale sales retail retailing product products merchandise material materials equipment tools supplies
customer customers client clients guest guests visitor visitors enquiry enquiries inquiry inquiries
complaint complaints request requests reservation reservations appointment appointments calendar calendars
front desk reception hotel hospitality restaurant kitchen bar dining room rooms public area areas
meal meals food beverage beverages drink drinks menu menus order orders table tables linen linens
laundry towels bed beds floor floors surface surfaces sanitation sanitise sanitize sanitised sanitized
hygiene hygienic safe safety procedure procedures standard standards guideline guidelines protocol protocols
quality accurate accurately accuracy efficient efficiently efficiency timely promptly quickly consistent consistently
busy peak daily weekly monthly routine regular regularly scheduled shift shifts opening closing morning evening
business businesses office administrative administration clerical document documents documentation file files filing
correspondence telephone calls email emails messages mail meeting meetings minutes note notes spreadsheet spreadsheets
database databases data information recordkeeping bookkeeping accounting account accounts payable receivable ledger
payroll wages payment payments cash card cards register tills till credit debit deposits supplier suppliers
expense expenses cost costs budget budgets financial finance reconciliation invoice invoices overdue outstanding
schedule roster rosters delivery deliveries warehouse storage inventory stock quantity quantities shortage shortages
maintenance preventive preventative mechanical electrical electricity circuit circuits wiring wire wires lighting
outlet outlets conduit panel panels fault faults installation installations plumbing pipe pipes drain drains
water drainage leak leaks leaking fixture fixtures carpentry timber wood wooden cabinet cabinets furniture
door doors window windows frame frames masonry brick bricks block blocks concrete mortar plaster plastered
wall walls construction building buildings site sites painting paint coating coatings protective protection
sand sanding prime priming air conditioning refrigeration refrigerant filters heating cooling ventilation
machine machines machinery motor motors mechanical machinery troubleshooting troubleshoot troubleshoot diagnosed
keep keeps kept choose chooses chose chosen identify identifies identified identifying operation operations query queries fast friendly reliable strong excellent assistive problem problems solution solutions improve improved improving improvement improvements reduce reduced reducing
increase increased increasing achieve achieved achieving outcome outcomes result results progress practical
independently collaboratively together directly alongside across multiple several range range various different
ability abilities knowledge understanding familiar familiarity competent competence proficient proficiency
certificate certificates certification certifications credential credentials certified qualify qualified qualification
qualifications course courses attendance attended attend attending earned attained attainment obtained possession
possess possesses possessed hold holds holding current currently valid validity expired expires expiry expiration
cancelled canceled cancellation revoked suspended renewal renewing renew pending pursuing enrolled incomplete
claim claims claimed statement statements states stated describes described describe relates related relevant
belongs belong belonging attributed attribution applies apply applicable performed genuinely actually
summary profile notes objective objectives context example examples copied vacancy advertisement description
first aid cpr pos hvac microsoft excel google sheets word office point system systems software technology
computer computers digital electronic manual online equipment tools
changes close readiness multimeter documented documenting read reads reading drawing drawings lockout tagout opera pms
outgoing exceed exceeds exceeded exceeding target targets relations organisation organization solving
`.split(/\s+/)) if (word) professionalWords.add(word)
const safeInitialWords = new Set(`i we my our this these the a an during before after throughout while as at in on for with
provided assisted answered resolved handled responded managed maintained tracked monitored conducted performed replenished
received recorded ordered reconciled prepared balanced checked processed welcomed confirmed updated served took set delivered
mixed cooked portioned cleaned changed inspected sanitised sanitized followed disinfected counted operated entered used
scheduled coordinated filed organised organized archived issued calculated installed tested repaired fitted cleared replaced
built constructed measured laid plastered poured painted applied sanded serviced trained training responsible experienced read
experience professional currently certified earned completed hold current first food cpr electrical plumbing bookkeeping
summary profile notes this these duties tasks responsibilities employment work customer guest inventory office restaurant
cash payroll account accounts data spreadsheet microsoft google requirements expected would did never no not my our
consistently exceeded communication sales organisation organization digital problem
`.split(/\s+/))
const allowedCapitalTokens = new Set(['I', 'CPR', 'POS', 'HVAC', 'Excel'])
for (const word of ['he', 'she', 'his', 'her']) professionalWords.delete(word)
function safeProfessionalText(original: string, maximumCharacters: number): boolean {
  // Only PDF.js LF boundaries are treated as spaces during validation. The
  // original excerpt and its UTF-16 span remain unchanged, including every LF.
  if (original.length > maximumCharacters || original !== original.trim()) return false
  const value = original.replace(/\n/g, ' ')
  if (value.length < 1 || value !== value.trim() || !/^[A-Za-z ,.;:'()\-/]+$/.test(value) || /\//.test(value.replace(/\blockout\/tagout\b/gi, '')) ||
      /(?:https?|www|mailto|email address|e-mail address|phone number|telephone number|contact details|social security|date of birth)/i.test(value) ||
      /\b(?:i (?:have|had)|my)\b.*\b(?:credit|wages?|financial accounts?|accounts?)\b|\b(?:i use|my profile|my pronouns)\b.*\b(?:they|them|their)\b/i.test(value) ||
      /\b(?:work|worked|working|employed|employment)\b.*\b(?:at|for|by) +(?:microsoft|google|opera|excel)\b/i.test(value) ||
      /\bmicrosoft\b(?! +(?:excel|word|office)\b)|\bgoogle\b(?! +sheets\b)|\bopera\b(?! +pms\b)/i.test(value)) return false
  if (/^(?:Skills|Experience|Work experience|Professional experience|Certifications|Credentials|Summary|Profile|Notes)$/i.test(value)) return true
  const words = [...value.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)]
  if (!words.length || words.some(word => !professionalWords.has(word[0].toLowerCase()))) return false
  const softwareSpans = [...value.matchAll(/\b(?:Microsoft (?:Excel|Word|Office)|Google Sheets|Opera PMS)\b/g)].map(match => [match.index!, match.index! + match[0].length])
  for (const [index, word] of words.entries()) {
    if (softwareSpans.some(([start, end]) => word.index! >= start && word.index! + word[0].length <= end)) continue
    if (/^[A-Z]/.test(word[0]) && !allowedCapitalTokens.has(word[0])) {
      const sentenceStart = index === 0 || /[.!?] +$/.test(value.slice(words[index - 1].index! + words[index - 1][0].length, word.index))
      if (!sentenceStart || !safeInitialWords.has(word[0].toLowerCase())) return false
    }
  }
  return true
}
export function isSafeProfessionalRecord(value: string): boolean {
  return safeProfessionalText(value, 400)
}
/** Local-only complete paragraph check before sentence projection. Never emit
 * this wider bound as evidence: each transmitted exact span is still <=400. */
export function isSafeProfessionalParagraph(value: string): boolean {
  return safeProfessionalText(value, 1600)
}
/** Whole-list admission precedes selective skill extraction. Unknown fragments
 * must themselves pass the closed professional vocabulary gate; qualifiers or
 * private/instruction content invalidate the entire list, not just one part. */
const skillFragmentWords = new Set(`electronic digital proficiency paper records record document documents filing office administration administrative
computer computers software spreadsheets data entry customer customers relations service sales inventory management
communication teamwork organisation organization problem solving time bookkeeping payroll accounts payable receivable`.split(/\s+/))
export function isSafeSkillListRecord(value: string): boolean {
  if (value.length < 1 || value.length > 1600 || value !== value.trim() ||
      !/^[A-Za-z \n,;|\u2022\u00b7.\-]+$/.test(value) ||
      /\b(?:i|my|we|our|they|their|he|she|his|her|not|no|never|without|lack|lacks|lacking|trained|training|would|could|should|required|requirements?|expected|only|supervisors?|colleagues?|managers?|belongs?|copied|future|planned|pending|expired|cancelled|canceled|revoked|suspended|pursuing|enrolled|incomplete|samples?|examples?|hypothetical|practice|attendance|yet|rather|instead)\b/i.test(value)) return false
  const parts = value.split(/[,;|\u2022\u00b7]/).map(part => part.trim().replace(/\.$/, ''))
  return parts.length > 0 && parts.every(part => Boolean(lookupEvidence(part, 'skill')) ||
    // Unknown declarative noun fragments may be omitted independently, but
    // arbitrary professional sentences/imperatives are NOT a skills grammar.
    (/^[A-Za-z \n-]+$/.test(part) && part.split(/[ \n-]+/).every(word => skillFragmentWords.has(word.toLowerCase())) &&
      safeProfessionalText(part, 400)))
}
export const SCREENING_DERIVED_CONTEXT = Object.freeze({
  other: 'The source attributes some statements to another person.',
  training: 'The source describes training rather than performed work.',
  negated: 'The source negates some described work.',
  requirement: 'The source describes requirements or future duties.',
  credential: 'The source reports an expired or cancelled credential.',
  omitted: 'Context omitted or unknown.',
})
export const screeningContextSchema = z.object({
  id: z.string().regex(/^context_[1-9][0-9]?$/),
  kind: z.enum(['professional_context', 'derived_attribution', 'omitted']),
  excerpt: z.string().min(1).max(400),
  location: z.string().max(80).regex(/^pdf\.page\[[1-9][0-9]{0,2}\]\.span\[(?:0|[1-9][0-9]{0,5}):[1-9][0-9]{0,5}\]$/),
}).strict()
export type ScreeningContext = z.infer<typeof screeningContextSchema>
const criterionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/), label: wholeText,
  category: z.enum(['skill', 'relevant_experience', 'job_certification']),
  weight: z.number().int().min(1).max(100), verificationRequired: z.boolean(),
}).strict()
export function validateScreeningCriteria(input: unknown): Snapshot['rubric']['criteria'] {
  const criteria = z.array(criterionSchema).min(1).max(20).parse(input)
  if (criteria.reduce((sum, c) => sum + c.weight, 0) !== 100 || new Set(criteria.map(c => c.id)).size !== criteria.length ||
      criteria.some(c => !lookup(c.label, c.category) || (c.category === 'job_certification' && !c.verificationRequired))) {
    throw new Error('Unsupported screening criteria')
  }
  return criteria
}
const evidenceSchema = z.object({
  id: z.string().regex(/^(?:skill|experience|credential)_[1-9][0-9]?$/),
  category: z.enum(['skill', 'relevant_experience', 'job_certification']), excerpt: z.string().min(1).max(400),
  interpretation: z.literal('ai_contextual').optional(),
  qualifiers: screeningQualifiersSchema.optional(),
  location: z.string().max(80).refine(value => /^builder\.skills\[(?:0|[1-9][0-9]?)\]$/.test(value) ||
    /^pdf\.page\[[1-9][0-9]{0,2}\]\.span\[(?:0|[1-9][0-9]{0,5}):[1-9][0-9]{0,5}\]$/.test(value)),
}).strict()
const extractionSchema = z.object({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), evidence: z.array(evidenceSchema).max(50),
  context: z.array(screeningContextSchema).max(20).optional(), omittedContext: z.boolean().optional(),
}).strict()
export type MinimizedExtraction = z.infer<typeof extractionSchema>
export function validateMinimizedExtraction(input: unknown, expectedSourceSha256: string): MinimizedExtraction {
  const result = extractionSchema.parse(input)
  const contexts = result.context ?? []
  if (contexts.some(item => {
    const span = /span\[(\d+):(\d+)\]$/.exec(item.location)!
    if (Number(span[2]) <= Number(span[1])) return true
    if (item.kind === 'professional_context') return !isSafeProfessionalRecord(item.excerpt) || Number(span[2]) - Number(span[1]) !== item.excerpt.length
    return item.kind === 'omitted' ? item.excerpt !== SCREENING_DERIVED_CONTEXT.omitted
      : !Object.values(SCREENING_DERIVED_CONTEXT).some(text => text !== SCREENING_DERIVED_CONTEXT.omitted && text === item.excerpt)
  }) || new Set(contexts.map(item => item.id)).size !== contexts.length ||
      result.evidence.reduce((sum, item) => sum + item.excerpt.length, 0) + contexts.reduce((sum, item) => sum + item.excerpt.length, 0) > 16_000 ||
      (contexts.some(item => item.kind === 'omitted') && result.omittedContext !== true)) throw new Error('Unsupported professional context')
  const prefixes = { skill: 'skill_', relevant_experience: 'experience_', job_certification: 'credential_' }
  if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256) || result.sourceSha256 !== expectedSourceSha256 ||
      new Set(result.evidence.map(e => e.id)).size !== result.evidence.length ||
      new Set(result.evidence.map(e => e.location)).size !== result.evidence.length ||
      result.evidence.some(e => {
        const span = /^pdf\.page\[\d+\]\.span\[(\d+):(\d+)\]$/.exec(e.location)
        if (e.interpretation === 'ai_contextual') {
          return !isSafeProfessionalRecord(e.excerpt) || !e.id.startsWith(prefixes[e.category]) || !span ||
            Number(span[2]) - Number(span[1]) !== e.excerpt.length
        }
        const intrinsic = lookupEvidence(e.excerpt, e.category)?.qualifiers
        const q = e.qualifiers
        const invalidQualifiers = e.category !== 'skill' && !q || q && intrinsic && (
          (intrinsic.assertion !== 'affirmed' && q.assertion === 'affirmed') ||
          (intrinsic.attribution !== 'applicant' && q.attribution === 'applicant') ||
          (intrinsic.context !== 'performed' && intrinsic.context !== 'declaration' && (q.context === 'performed' || q.context === 'declaration')) ||
          (e.category === 'job_certification' && ((intrinsic.credentialStatus !== 'claimed_current' && q.credentialStatus === 'claimed_current') ||
            (!['claimed_current', 'claimed_attainment'].includes(intrinsic.credentialStatus) && q.credentialStatus === 'claimed_attainment'))) ||
          (e.category !== 'job_certification' && q.credentialStatus !== 'not_applicable') ||
          (e.category === 'job_certification' && q.credentialStatus === 'not_applicable'))
        return !intrinsic || invalidQualifiers || !e.id.startsWith(prefixes[e.category]) ||
          (e.category !== 'skill' && !span) || (span !== null && Number(span[2]) - Number(span[1]) !== e.excerpt.length)
      })) throw new Error('Unsupported screening extraction')
  return result
}
/** Trusted capture must render these SAME skill values into the exact bytes.
 * A hash binds bytes, not semantic proof. Builder prose requires PDF extraction. */
export function minimizeBuilderSkills(input: unknown, sourceBytes: Uint8Array): MinimizedExtraction {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0 || sourceBytes.byteLength > 10 * 1024 * 1024) {
    throw new Error('Unsupported screening source')
  }
  const skills = z.array(wholeText).max(50).parse(input)
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
  return validateMinimizedExtraction({ sourceSha256, evidence: skills.map((excerpt, index) => ({
    id: `skill_${index + 1}`, category: 'skill', excerpt, location: `builder.skills[${index}]`,
  })) }, sourceSha256)
}

/** Published clauses are already public, but still revalidated before disclosure.
 * This branch is not an employer-approved rubric or a general PII guarantee. */
export function validatePublishedScreeningCriteria(input: unknown): Snapshot['rubric']['criteria'] {
  const criteria = z.array(criterionSchema.extend({
    label: z.string().min(1).max(300), interpretation: z.literal('ai_contextual'),
    importance: z.enum(['required', 'preferred', 'duty']), sourceOrder: z.number().int().nonnegative().max(32000),
  }).strict()).min(1).max(MAX_PUBLISHED_JOB_CRITERIA).parse(input)
  if (criteria.reduce((sum, c) => sum + c.weight, 0) !== 100 ||
      Math.max(...criteria.map(c => c.weight)) - Math.min(...criteria.map(c => c.weight)) > 1 ||
      criteria.reduce((sum, c) => sum + c.label.length, 0) > 4000 ||
      new Set(criteria.map(c => c.id)).size !== criteria.length ||
      criteria.some(c => !validatePublishedCriterionText(c.label))) throw new Error('Unsupported published criteria')
  return criteria
}

type ProjectedEvidenceBase = Readonly<{ evidenceId: string; category: Category; sourceOrder: number;
  provenance: 'applicant_reported'; verification: 'unverified'; qualifiers?: ScreeningEvidenceQualifiers }>
export type ScreeningProjection = Readonly<{
  rubric: readonly Readonly<{ criterionId: string; category: Category | 'job_relevance'; requirement: string;
    interpretation?: 'ai_contextual'; importance?: 'required' | 'preferred' | 'duty'; sourceOrder?: number }>[]
  jobContextOmitted?: boolean
  jobContext?: readonly Readonly<{ contextId: string; statement: string; sourceOrder: number }> []
  evidence: readonly (ProjectedEvidenceBase & (Readonly<{ concept: string }> | Readonly<{ interpretation: 'ai_contextual'; statement: string }>))[]
  context: readonly Readonly<{ contextId: string; kind: ScreeningContext['kind']; statement: string; sourceOrder: number }>[]
  omittedContext: boolean
}>
/** Only bounded whole safe records and finite reviewed concepts/qualifiers leave.
 * Exact raw source IDs, spans, dates, digest, names and metadata stay local. */
export function minimizeScreeningSnapshot(input: Snapshot): ScreeningProjection {
  const snapshot = readSnapshot(captureSnapshot(input))
  const published = snapshot.rubric.approved === false
  const criteria = published ? validatePublishedScreeningCriteria(snapshot.rubric.criteria) : validateScreeningCriteria(snapshot.rubric.criteria)
  if (snapshot.rubric.approved === false && (snapshot.rubric.jobContext.some(c => !validatePublishedCriterionText(c.text)) ||
      snapshot.rubric.jobContext.reduce((n, c) => n + c.text.length, 0) + criteria.reduce((n, c) => n + c.label.length, 0) > 4000)) {
    throw new Error('Unsupported published context')
  }
  const extraction = validateMinimizedExtraction({ sourceSha256: snapshot.resume.sha256, evidence: snapshot.resume.evidence,
    ...(snapshot.resume.context ? { context: snapshot.resume.context } : {}),
    ...(snapshot.resume.omittedContext !== undefined ? { omittedContext: snapshot.resume.omittedContext } : {}),
  }, snapshot.resume.sha256)
  const ordered = [...extraction.evidence, ...(extraction.context ?? [])].map((item, index) => {
    const match = /^pdf\.page\[(\d+)\]\.span\[(\d+):/.exec(item.location)
    return { item, page: match ? Number(match[1]) : 0, start: match ? Number(match[2]) : index }
  }).sort((a, b) => a.page - b.page || a.start - b.start)
  const order = (item: { id: string }) => ordered.findIndex(row => row.item.id === item.id) + 1
  return Object.freeze({
    rubric: Object.freeze(criteria.map((c, index) => Object.freeze(published
      ? { criterionId: `c${index + 1}`, category: 'job_relevance' as const, requirement: c.label,
        interpretation: 'ai_contextual' as const, importance: c.importance, sourceOrder: c.sourceOrder }
      : { criterionId: `c${index + 1}`, category: c.category, requirement: lookup(c.label, c.category)!.label }))),
    ...(snapshot.rubric.approved === false ? { jobContextOmitted: snapshot.rubric.omittedContext,
      jobContext: Object.freeze(snapshot.rubric.jobContext.map((c, i) => Object.freeze({ contextId: `j${i + 1}`, statement: c.text, sourceOrder: c.sourceOrder }))) } : {}),
    evidence: Object.freeze(extraction.evidence.map((e, index) => Object.freeze({ evidenceId: `e${index + 1}`, category: e.category,
      ...(e.interpretation === 'ai_contextual' ? { interpretation: 'ai_contextual' as const, statement: e.excerpt } : { concept: lookupEvidence(e.excerpt, e.category)!.label }),
      provenance: 'applicant_reported' as const, verification: 'unverified' as const, sourceOrder: order(e),
      ...(e.qualifiers ? { qualifiers: Object.freeze(e.qualifiers) } : e.interpretation ? {} : { qualifiers: Object.freeze(baseQualifiers(e.category)) }),
    }))),
    context: Object.freeze((extraction.context ?? []).map((item, index) => Object.freeze({ contextId: `x${index + 1}`,
      kind: item.kind, statement: item.excerpt, sourceOrder: order(item) }))),
    omittedContext: extraction.omittedContext ?? false,
  })
}
