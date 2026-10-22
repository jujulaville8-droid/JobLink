/** Entirely synthetic builder data for offline renderer/parser compatibility. */
import type { CvFull } from '../../src/lib/types'
import { resumeFixture } from './resume'

export function builderScreeningFixture(): CvFull {
  return {
    ...structuredClone(resumeFixture),
    profile: { ...resumeFixture.profile, job_title: 'Customer Service Assistant',
      summary: 'Customer-service professional with experience recording orders, resolving delivery queries and maintaining accurate stock records.' },
    contact: { first_name: 'Jordan', last_name: 'Ellis', location: 'St. John’s, Antigua',
      email: 'jordan.ellis@example.invalid', phone: '+1 (268) 555-0148' },
    experiences: [
      { ...resumeFixture.experiences[0], job_title: 'Customer Service Assistant', company_name: 'Aurora Supply',
        description: 'Answered customer enquiries, explained product options and recorded order details. Followed up delayed deliveries and resolved queries with the stock team.' },
      { ...resumeFixture.experiences[0], id: 'work-2', sort_order: 1, job_title: 'Inventory Clerk', company_name: 'Harbour Stores',
        description: 'Reconciled stock sheets without errors. Processed returns when replacement stock was not needed. Provided training to customers.',
        start_date: '2020-01-01', end_date: '2022-05-01', is_current: false },
    ],
    education: [{ ...resumeFixture.education[0], degree: 'Diploma', field_of_study: 'Business Operations',
      description: 'Completed coursework in order processing and customer communication.' }],
    skills: [{ ...resumeFixture.skills[0], name: 'Microsoft Excel' }],
    awards: [], certifications: [], projects: [], languages: [], volunteer: [], memberships: [], references: [],
  }
}
