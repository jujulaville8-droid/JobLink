// ─── Enums / Union Types ────────────────────────────────────────────

export type UserRole = 'seeker' | 'employer' | 'admin';

export type VisibilityMode = 'actively_looking' | 'open' | 'not_looking';

export type JobType = 'full_time' | 'part_time' | 'seasonal' | 'contract';

export type JobStatus = 'active' | 'closed' | 'pending_approval';

export type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'hold';

// ─── Table Interfaces ───────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
  is_banned: boolean;
  created_at: string;
}

export interface SeekerProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  location: string;
  bio: string;
  skills: string[];
  experience_years: number | null;
  education: string;
  cv_url: string;
  visibility: VisibilityMode;
  profile_complete_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  company_name: string;
  logo_url: string;
  description: string;
  industry: string;
  website: string;
  location: string;
  is_verified: boolean;
  is_pro: boolean;
  stripe_customer_id: string | null;
  pro_expires_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  company_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  current_period_end: string;
}

export interface JobListing {
  id: string;
  company_id: string;
  title: string;
  description: string;
  category: string;
  job_type: JobType;
  salary_min: number | null;
  salary_max: number | null;
  salary_visible: boolean;
  location: string;
  requires_work_permit: boolean;
  status: JobStatus;
  is_featured: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface JobListingWithCompany extends JobListing {
  company: Company;
}

export interface Application {
  id: string;
  job_id: string;
  seeker_id: string;
  cover_letter_url: string;
  cover_letter_text: string;
  status: ApplicationStatus;
  applied_at: string;
}

export interface ApplicationWithDetails extends Application {
  job: JobListingWithCompany;
  seeker: SeekerProfile;
}

export interface JobAlert {
  id: string;
  seeker_id: string;
  keywords: string[];
  industry: string | null;
  job_type: string | null;
  created_at: string;
}

export interface SavedJob {
  id: string;
  seeker_id: string;
  job_id: string;
  saved_at: string;
}

export interface ReportedListing {
  id: string;
  job_id: string;
  reported_by: string;
  reason: string;
  created_at: string;
}

// ─── Messaging ──────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  application_id: string;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  is_blocked: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
  // Client-only: optimistic send state
  _optimistic?: boolean;
  _failed?: boolean;
}

export interface InboxConversation extends Conversation {
  unread_count: number;
  is_archived: boolean;
  other_participant: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    is_online?: boolean;
    last_seen_at?: string | null;
  };
  application_context: {
    job_title: string;
    company_name: string;
    application_status: ApplicationStatus;
  };
}

export interface ConversationMeta {
  other_user_id: string;
  other_display_name: string;
  other_avatar_url: string | null;
  other_is_online: boolean;
  other_last_seen_at: string | null;
  job_title: string;
  company_name: string;
  application_status: ApplicationStatus;
  application_id: string | null;
  is_archived: boolean;
  is_blocked: boolean;
  dialogue_open: boolean;
  seeker_user_id: string;
}

export interface UserMessagingSettings {
  email_notifications: boolean;
  sms_notifications: boolean;
  show_online_status: boolean;
  show_read_receipts: boolean;
  notification_cooldown_minutes: number;
}

export interface MessageTemplate {
  id: string;
  role: UserRole;
  label: string;
  body: string;
  sort_order: number;
}

export interface ConversationReport {
  id: string;
  conversation_id: string;
  reported_by: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────

export const INDUSTRIES: string[] = [
  "Tourism & Hospitality",
  "Government & Civil Service",
  "Banking & Finance",
  "Retail & Trade",
  "Construction",
  "Healthcare",
  "Education",
  "Legal",
  "Technology",
  "Transportation & Logistics",
  "Agriculture & Fishing",
  "Real Estate & Property",
  "Food & Beverage",
  "Manufacturing",
  "Telecommunications",
  "Insurance",
  "Non-Profit & NGO",
  "Arts & Entertainment",
  "Automotive",
  "Security & Safety",
  "Cleaning & Maintenance",
  "Administrative & Office",
  "Marketing & Media",
  "Accounting",
  "Customer Service",
  "Other",
];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  seasonal: "Seasonal",
  contract: "Contract",
};

// ─── CV Builder Types ────────────────────────────────────────────────

export interface CvProfile {
  id: string;
  user_id: string;
  job_title: string | null;
  summary: string | null;
  completion_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface CvWorkExperience {
  id: string;
  cv_profile_id: string;
  company_name: string;
  job_title: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  sort_order: number;
}

export interface CvEducation {
  id: string;
  cv_profile_id: string;
  institution: string;
  degree: string;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  sort_order: number;
}

export interface CvSkill {
  id: string;
  cv_profile_id: string;
  name: string;
  sort_order: number;
}

export interface CvAward {
  id: string;
  cv_profile_id: string;
  title: string;
  issuer: string | null;
  date_received: string | null;
  description: string | null;
  sort_order: number;
}

export interface CvCertification {
  id: string;
  cv_profile_id: string;
  name: string;
  issuing_organization: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  sort_order: number;
}

export interface CvContact {
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  location: string | null;
}

export interface CvFull {
  profile: CvProfile;
  contact: CvContact;
  experiences: CvWorkExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  awards: CvAward[];
  certifications: CvCertification[];
}
