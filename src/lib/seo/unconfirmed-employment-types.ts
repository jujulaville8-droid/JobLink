// October 10 review recorded that this vacancy's stored full_time was treated
// as an unconfirmed assumption. JobPosting no longer consults this list:
// the page shows the stored job type, and employmentType follows that value.
// Do not rewrite the stored or visible type, or company-wide permission.
const UNCONFIRMED_EMPLOYMENT_TYPES: Record<string, string> = {
  '0d1245af-a425-4a7f-b670-15dc8c275993': '9fde7fc7-70b3-4354-9d11-d520f4ec09f9',
};

export function hasUnconfirmedEmploymentType(jobId: string, companyId?: string | null): boolean {
  return Object.hasOwn(UNCONFIRMED_EMPLOYMENT_TYPES, jobId) &&
    UNCONFIRMED_EMPLOYMENT_TYPES[jobId] === companyId;
}
