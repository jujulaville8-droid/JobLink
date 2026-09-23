import type { CvFull } from '@/lib/types';

export const resumeFixture: CvFull = {
  profile: { id: 'cv-1', user_id: 'user-1', job_title: 'Guest Services Supervisor', summary: 'Thoughtful hospitality service and practical team support.', completion_percentage: 100, created_at: '2026-01-01', updated_at: '2026-01-01' },
  contact: { first_name: 'Simone', last_name: 'Francis', email: 'simone@example.com', phone: '+1 268 555 0100', location: 'St. John’s, Antigua' },
  experiences: [{ id: 'work-1', cv_profile_id: 'cv-1', job_title: 'Guest Services Supervisor', company_name: 'Harbour House Hotel', location: 'St. John’s', start_date: '2022-06-01', end_date: null, is_current: true, description: 'Coordinate guest requests.\nSupport new team members.', sort_order: 0 }],
  education: [{ id: 'edu-1', cv_profile_id: 'cv-1', institution: 'Hospitality Institute', degree: 'Diploma', field_of_study: 'Hospitality Management', start_date: '2019-09-01', end_date: '2022-05-01', is_current: false, description: 'Service operations coursework', sort_order: 0 }],
  skills: Array.from({ length: 12 }, (_, i) => ({ id: `skill-${i}`, cv_profile_id: 'cv-1', name: `Skill ${i + 1}`, sort_order: i })),
  awards: [{ id: 'award-1', cv_profile_id: 'cv-1', title: 'Service award', issuer: 'Local Association', date_received: '2024-01-01', description: 'Recognised for mentoring', sort_order: 0 }],
  certifications: [{ id: 'cert-1', cv_profile_id: 'cv-1', name: 'First aid', issuing_organization: 'Training Centre', issue_date: '2025-02-01', expiry_date: '2027-02-01', sort_order: 0 }],
  projects: [{ id: 'project-1', cv_profile_id: 'cv-1', title: 'Guest welcome guide', role: 'Editor', url: 'https://example.com/guide', description: 'A practical local guide', start_date: '2023-01-01', end_date: '2023-02-01', sort_order: 0 }],
  languages: [{ id: 'language-1', cv_profile_id: 'cv-1', name: 'Spanish', proficiency: 'Conversational', sort_order: 0 }],
  volunteer: [{ id: 'volunteer-1', cv_profile_id: 'cv-1', organization: 'Community Pantry', role: 'Coordinator', description: 'Organise weekly deliveries', start_date: null, end_date: null, is_current: false, sort_order: 0 }],
  memberships: [{ id: 'member-1', cv_profile_id: 'cv-1', organization: 'Hospitality Network', role: 'Member', year_joined: '2024', sort_order: 0 }],
  references: [{ id: 'ref-1', cv_profile_id: 'cv-1', name: 'Alex Example', title: 'Manager', company: 'Example Hotel', phone: '+1 268 555 0101', email: 'alex@example.com', relationship: 'Former supervisor', sort_order: 0 }],
};
