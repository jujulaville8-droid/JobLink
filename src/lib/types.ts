// ─── Enums / Union Types ────────────────────────────────────────────

export type UserRole = 'seeker' | 'employer' | 'admin';

export type VisibilityMode = 'actively_looking' | 'open' | 'not_looking';

export type JobType = 'full_time' | 'part_time' | 'seasonal' | 'contract';

export type JobStatus = 'active' | 'closed' | 'pending_approval';

export type ApplicationStatus = 'applied' | 'shortlisted' | 'rejected' | 'hired';

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
  pro_expires_at: string | null;
  created_at: string;
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
  "Other",
];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  seasonal: "Seasonal",
  contract: "Contract",
};
