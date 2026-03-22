/**
 * Shared profile completion calculator.
 * Used by the profile page (client) and stored in the DB via the API.
 */

export interface ProfileFields {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  education?: string | null;
  cv_url?: string | null;
  has_cv_profile?: boolean;
}

export interface CompletionResult {
  percentage: number;
  missing: string[];
  filled: number;
  total: number;
}

const REQUIRED_FIELDS: {
  key: keyof ProfileFields;
  label: string;
  check: (value: unknown, profile?: ProfileFields) => boolean;
}[] = [
  {
    key: "first_name",
    label: "First name",
    check: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "last_name",
    label: "Last name",
    check: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "phone",
    label: "Phone number",
    check: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "bio",
    label: "Bio",
    check: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "skills",
    label: "At least one skill",
    check: (v) => Array.isArray(v) && v.length > 0,
  },
  {
    key: "experience_years",
    label: "Years of experience",
    check: (v) => typeof v === "number" && v >= 0,
  },
  {
    key: "education",
    label: "Education",
    check: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "cv_url",
    label: "Resume (uploaded or built)",
    check: (v, profile) =>
      (typeof v === "string" && v.trim().length > 0) ||
      !!(profile as ProfileFields)?.has_cv_profile,
  },
];

export function calculateProfileCompletion(profile: ProfileFields): CompletionResult {
  const missing: string[] = [];
  let filled = 0;

  for (const field of REQUIRED_FIELDS) {
    if (field.check(profile[field.key], profile)) {
      filled++;
    } else {
      missing.push(field.label);
    }
  }

  const total = REQUIRED_FIELDS.length;
  const percentage = Math.round((filled / total) * 100);

  return { percentage, missing, filled, total };
}
