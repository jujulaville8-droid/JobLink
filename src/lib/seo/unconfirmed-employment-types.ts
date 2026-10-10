// Accuracy exclusions are separate from employer permission. October 10 review
// confirmed this vacancy's stored full_time is an unconfirmed assumption.
// Omit only optional structured data; do not rewrite the stored or visible type
// or change existing company-wide permission.
const UNCONFIRMED_EMPLOYMENT_TYPES: Record<string, string> = {
  '0d1245af-a425-4a7f-b670-15dc8c275993': '9fde7fc7-70b3-4354-9d11-d520f4ec09f9',
};

export function hasUnconfirmedEmploymentType(jobId: string, companyId?: string | null): boolean {
  return Object.hasOwn(UNCONFIRMED_EMPLOYMENT_TYPES, jobId) &&
    UNCONFIRMED_EMPLOYMENT_TYPES[jobId] === companyId;
}
