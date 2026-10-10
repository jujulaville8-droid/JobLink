import { publicJobDescription } from '@/lib/public-job-description';

interface VacancyDescriptionInput {
  id?: string | null;
  company_id?: string | null;
  title: string;
  description?: string | null;
}

interface VerifiedDescription {
  companyId: string;
  title: string;
  sourceDescription: string;
  description: string;
}

// Presentation-only fallbacks for these JobLink-managed imported records. Facts were
// checked against employer-branded posts on October 10, 2026 (sources below).
// This is not employer approval and must never enable JobPosting by itself.
// Match the original text exactly, including its retained deadline: any later
// description/title edit wins rather than being overwritten by this fallback.
// Application channels are JobLink editorial guidance: use the on-site Apply
// flow, while retaining source facts and requested application materials.
// Never use these public strings to change private employer delivery contacts.
const VERIFIED_DESCRIPTIONS: Record<string, VerifiedDescription> = {
  // Primary employer advert, posted by Star Times Adventure Tours:
  // https://www.facebook.com/groups/1580953365473898/permalink/4512493772319828/
  // No employment type, salary, hours or deadline was supplied.
  '232f9e93-d28c-4e8b-bdb5-3c85093e61d6': {
    companyId: 'e9703c50-bfef-41fb-99f1-5ba9387418c2',
    title: 'Driver Guide',
    sourceDescription: "Star Times Adventure Tours, based at Heritage Quay in St. John's, runs island tours, beach days and excursions for cruise and hotel guests across Antigua. They're hiring a Driver Guide.\n\nTo apply, email Ceostartimesadventuretours@gmail.com",
    description: `Star Times Adventure Tours in St. John's, Antigua is hiring a Driver Guide.

Responsibilities
- Safely transport guests on excursions
- Give friendly, informative island tours
- Assist during activities and excursions
- Create a fun, welcoming and memorable experience
- Represent the company professionally

Requirements
- Valid driver's licence
- Strong swimmer
- Safe and responsible driver
- Friendly and professional
- Excellent customer service
- Reliable and punctual

Advantages and training
Knowledge of Antigua and its attractions and bilingual ability are advantages. Guiding or hospitality experience is an advantage; otherwise, training is provided.

How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks.`,
  },
  // Original branded September 24 employer flyer:
  // https://www.facebook.com/photo/?fbid=10168041289173327&set=gm.28750704501225130&idorvanity=419253941463565
  // https://www.facebook.com/groups/jobsAntigua/posts/28750704501225130/
  // The original listing's full-time status was separately employer-confirmed
  // on September 29. No salary, hours or deadline is inferred.
  '318d3b16-6aff-453c-b0d3-fc5f2d779783': {
    companyId: '1b11e815-e80b-4b35-affe-55c1d1fc16db',
    title: 'Gym Attendant',
    sourceDescription: 'MOfit Gym and Fitness Centre in Vista, Antigua is hiring a full-time Gym Attendant.\n\nHow to apply: send your CV and a short note to mofit268@outlook.com.',
    description: `MOfit Gym and Fitness Centre in Vista, Antigua is hiring a full-time Gym Attendant.

Responsibilities
- Maintain a clean, positive and safe workout environment
- Provide accurate information about schedules, memberships and rules
- Assist with equipment use and basic exercise guidance
- Process payments, maintain records and handle other administrative tasks

Requirements
- Age 18 or older
- High school diploma
- Excellent communication and interpersonal skills
- Positive, enthusiastic attitude
- Able to multitask and prioritize
- Basic computer literacy and data-entry skills
- Basic knowledge of fitness equipment and terminology
- Team player

How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Add a short note in the cover letter field.`,
  },
  // Original branded September 30 employer advert:
  // https://www.facebook.com/photo/?fbid=10163206382918730&set=gm.28968115112806771&idorvanity=144927202218946
  // https://www.facebook.com/groups/144927202218946/permalink/28968115112806771/
  // No employment type, salary, hours or deadline was supplied.
  '0d1245af-a425-4a7f-b670-15dc8c275993': {
    companyId: '9fde7fc7-70b3-4354-9d11-d520f4ec09f9',
    title: 'Executive Chef (Japanese & Peruvian cuisine)',
    sourceDescription: 'Executive Chef (Japanese & Peruvian cuisine)\nNobu Barbuda, Barbuda\nHow to apply: email EMANOUSOU@NOBUHOTELS.COM',
    description: `Nobu Barbuda in Barbuda is hiring an Executive Chef (Japanese & Peruvian cuisine).

Requirements and responsibilities
- Schooled in Japanese and Peruvian cuisine
- At least 6 years of experience at a high-volume restaurant
- Ability to train
- Perform cost control and profit-and-loss responsibilities

How to apply: use the Apply button on this page to submit your application through JobLinks.`,
  },
  // Employer flyer:
  // https://www.facebook.com/groups/144927202218946/permalink/28904328982518718/
  // https://www.facebook.com/photo/?fbid=10163184421393730&set=gm.28904328982518718&idorvanity=144927202218946
  'd4fdb396-a0b0-427d-aae0-ed756274375e': {
    companyId: '42e58a5e-3f56-4f2b-b829-b9b335d45b81',
    title: 'Van Sales Assistant/Operator',
    sourceDescription: 'Food Brokerage Services Ltd. is hiring a Van Sales Assistant/Operator in Antigua.\n\nApplications close October 30, 2026.',
    description: `Food Brokerage Services Ltd. is hiring a Van Sales Assistant/Operator in Antigua.

Responsibilities
- Identify and pursue new business opportunities
- Build and maintain strong customer relationships

Requirements
- Must be able to operate a manual truck

Commission
Earn commission when you meet or exceed sales targets.

How to apply: use the Apply button on this page to submit your application through JobLinks.`,
  },
  // Employer-owned post and flyer:
  // https://www.instagram.com/p/DeKanfUBwRQ/
  // The residence/work-eligibility requirements also appear in the original
  // employer-supplied listing below. No employment type or pay is inferred.
  'ade78a5c-e0f6-4f5f-8008-117d7a4b96ee': {
    companyId: '1b68107a-228a-4e97-b047-d4c14bd730ef',
    title: 'Rage Room Attendant',
    sourceDescription: "Shhatterr Shack Rage Room in St. John's is hiring a Rage Room Attendant.\n\nApplicants must be legally able to work in Antigua and be located in Antigua.\n\nApplication deadline: 30 October 2026.",
    description: `Shhatterr Shack Rage Room in St. John's is hiring a Rage Room Attendant.

Responsibilities
- Check in customers
- Set up rage-room sessions
- Brief guests on safety rules
- Monitor and assist during sessions
- Reset rooms after each session

Requirements
- Friendly and professional
- Reliable and punctual
- Able to lift up to 20 lb
- Good communication skills
- Enthusiastic about a fun, high-energy environment
- Legally able to work in Antigua and located in Antigua

How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Add a short explanation of why you are a good fit in the cover letter field. No DMs.`,
  },
  // Admin-imported Woodstock record, captured in approved-job-listings.json.
  // Only the application paragraph is edited; all role facts, the source website
  // and the retained cutoff remain byte-for-byte as stored. Later edits win.
  'bb1b011d-4e5c-4005-81b6-bc70c48acf4f': {
    companyId: '6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961',
    title: 'Carpenter / Boatbuilder',
    sourceDescription: "JOIN THE CREW AT WOODSTOCK BOATBUILDERS\n\nWoodstock BoatBuilders in English Harbour (Dockyard Drive) is hiring a full-time Carpenter / Boatbuilder.\n\nWe are looking for a competent, reliable, and punctual Carpenter to join our team in a fast-paced, dynamic, and highly rewarding work environment. Whether you are a seasoned marine carpenter or a skilled woodworker eager to transition into the yachting industry, we want to hear from you.\n\nWhat we are looking for\n- Experience: previous experience working on boats is preferable but not a necessity. Anyone with a passion to learn is welcome.\n- Work ethic: must be reliable, punctual, and committed to producing work of the highest quality in a dynamic setting.\n\nWhat we offer\n- Top compensation: some of the best pay rates on the island.\n- Exceptional projects: the opportunity to ply your trade on world-class vessels and develop highly specialized craftsmanship.\n\nHow to apply: all enquiries must be by email. Send your CV/resume and any other pertinent information to office@woodstockboats.com. We will get back to all applicants.\n\nApply before: 29 October 2026\nLearn more: woodstockboatbuilders.com",
    description: "JOIN THE CREW AT WOODSTOCK BOATBUILDERS\n\nWoodstock BoatBuilders in English Harbour (Dockyard Drive) is hiring a full-time Carpenter / Boatbuilder.\n\nWe are looking for a competent, reliable, and punctual Carpenter to join our team in a fast-paced, dynamic, and highly rewarding work environment. Whether you are a seasoned marine carpenter or a skilled woodworker eager to transition into the yachting industry, we want to hear from you.\n\nWhat we are looking for\n- Experience: previous experience working on boats is preferable but not a necessity. Anyone with a passion to learn is welcome.\n- Work ethic: must be reliable, punctual, and committed to producing work of the highest quality in a dynamic setting.\n\nWhat we offer\n- Top compensation: some of the best pay rates on the island.\n- Exceptional projects: the opportunity to ply your trade on world-class vessels and develop highly specialized craftsmanship.\n\nHow to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Include any other pertinent information in the cover letter field. We will get back to all applicants.\n\nApply before: 29 October 2026\nLearn more: woodstockboatbuilders.com",
  },
};

/** Shared public text for the vacancy body, search/share excerpt and JSON-LD. */
export function publicVacancyDescription(job: VacancyDescriptionInput): string {
  const fallback = job.id && Object.hasOwn(VERIFIED_DESCRIPTIONS, job.id)
    ? VERIFIED_DESCRIPTIONS[job.id]
    : undefined;
  const description = fallback && fallback.companyId === job.company_id &&
    fallback.title === job.title && fallback.sourceDescription === job.description
    ? fallback.description
    : job.description;
  // Never mutate the raw record or its deadline. Public deadline presentation
  // stays governed by the existing helper, independently of Google eligibility.
  return publicJobDescription(description);
}
