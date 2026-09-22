import { notFound } from "next/navigation";
import HomePage from "@/components/home/HomePage";
import type { Job } from "@/components/JobCard";
export const metadata = { title: "Local design preview", robots: { index: false, follow: false } };
export default function DesignPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const jobs: Job[] = [
    { id: "preview-1", title: "Front Desk Associate", company_name: "Harbour Bay Hotel", location: "St. John's", job_type: "Full-time" },
    { id: "preview-2", title: "Electrician", company_name: "Antigua Power Services", location: "All Saints", job_type: "Full-time" },
    { id: "preview-3", title: "Office Administrator", company_name: "Island Business Solutions", location: "St. John's", job_type: "Full-time" },
  ].map(job => ({ ...job, company_logo: null, salary_min: null, salary_max: null, salary_visible: false, created_at: "2026-09-22", is_featured: false, is_pro_company: false }));
  return <HomePage jobs={jobs} preview />;
}
