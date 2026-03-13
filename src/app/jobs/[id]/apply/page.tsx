"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ProfileStatus = {
  hasProfile: boolean;
  missingFields: string[];
  seekerId: string | null;
};

type JobInfo = {
  id: string;
  title: string;
  location: string;
  job_type: string;
  status: string;
  company: { company_name: string } | null;
};

type PageState =
  | "loading"
  | "not-authenticated"
  | "not-seeker"
  | "profile-incomplete"
  | "already-applied"
  | "job-not-found"
  | "job-closed"
  | "ready"
  | "submitting"
  | "success"
  | "error";

export default function ApplyPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [state, setState] = useState<PageState>("loading");
  const [job, setJob] = useState<JobInfo | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>({
    hasProfile: false,
    missingFields: [],
    seekerId: null,
  });
  const [coverLetter, setCoverLetter] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // Check auth
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login with return path
        window.location.href = `/login?returnTo=/jobs/${jobId}/apply`;
        return;
      }

      // Fetch job info
      const { data: jobData, error: jobError } = await supabase
        .from("job_listings")
        .select("id, title, location, job_type, status, company:companies(company_name)")
        .eq("id", jobId)
        .single();

      if (jobError || !jobData) {
        setState("job-not-found");
        return;
      }

      const jobInfo: JobInfo = {
        ...jobData,
        company: jobData.company as unknown as { company_name: string } | null,
      };
      setJob(jobInfo);

      if (jobInfo.status !== "active") {
        setState("job-closed");
        return;
      }

      // Check user role
      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!userData || userData.role !== "seeker") {
        setState("not-seeker");
        return;
      }

      // Check seeker profile
      const { data: profile } = await supabase
        .from("seeker_profiles")
        .select("id, first_name, last_name, phone, cv_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        setProfileStatus({ hasProfile: false, missingFields: ["Profile not created"], seekerId: null });
        setState("profile-incomplete");
        return;
      }

      const missing: string[] = [];
      if (!profile.first_name) missing.push("First name");
      if (!profile.last_name) missing.push("Last name");
      if (!profile.phone) missing.push("Phone number");
      if (!profile.cv_url) missing.push("CV/Resume upload");

      if (missing.length > 0) {
        setProfileStatus({ hasProfile: true, missingFields: missing, seekerId: profile.id });
        setState("profile-incomplete");
        return;
      }

      // Check if already applied
      const { data: existing } = await supabase
        .from("applications")
        .select("id")
        .eq("job_id", jobId)
        .eq("seeker_id", profile.id)
        .maybeSingle();

      if (existing) {
        setState("already-applied");
        return;
      }

      setProfileStatus({ hasProfile: true, missingFields: [], seekerId: profile.id });
      setState("ready");
    }

    init();
  }, [jobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/jobs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          cover_letter_text: coverLetter.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setState("already-applied");
          return;
        }
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setState("error");
    }
  }

  // ─── Loading ───
  if (state === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center animate-fade-up">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-text-light">Loading application...</p>
      </div>
    );
  }

  // ─── Job not found ───
  if (state === "job-not-found") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-2xl text-text">Job Not Found</h1>
        <p className="mt-2 text-text-light">This listing may have been removed or is no longer active.</p>
        <Link href="/jobs" className="mt-6 inline-flex items-center gap-2 btn-primary text-sm">
          Browse all jobs
        </Link>
      </div>
    );
  }

  // ─── Job closed ───
  if (state === "job-closed") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center animate-fade-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-2xl text-text">Applications Closed</h1>
        <p className="mt-2 text-text-light">This job is no longer accepting applications.</p>
        <Link href="/jobs" className="mt-6 inline-flex items-center gap-2 btn-primary text-sm">
          Browse other jobs
        </Link>
      </div>
    );
  }

  // ─── Not a seeker ───
  if (state === "not-seeker") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-2xl text-text">Employer Account</h1>
        <p className="mt-2 text-text-light">
          Only job seekers can apply to listings. Switch to your seeker account to apply.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 btn-primary text-sm">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  // ─── Profile incomplete ───
  if (state === "profile-incomplete") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-up">
        <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <svg className="h-8 w-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl text-text">Complete Your Profile</h1>
          <p className="mt-2 text-text-light">
            Before applying to <span className="font-medium text-text">{job?.title}</span>, please complete the following:
          </p>
          <ul className="mt-4 space-y-2">
            {profileStatus.missingFields.map((field) => (
              <li key={field} className="flex items-center justify-center gap-2 text-sm text-amber-700">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {field}
              </li>
            ))}
          </ul>
          <Link
            href={`/profile?returnTo=/jobs/${jobId}/apply`}
            className="mt-6 inline-flex items-center gap-2 btn-warm text-sm"
          >
            Complete Profile
          </Link>
        </div>
      </div>
    );
  }

  // ─── Already applied ───
  if (state === "already-applied") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-up">
        <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl text-text">Already Applied</h1>
          <p className="mt-2 text-text-light">
            You&apos;ve already submitted your application for <span className="font-medium text-text">{job?.title}</span>.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/applications" className="btn-primary text-sm">
              View My Applications
            </Link>
            <Link href="/jobs" className="text-sm font-medium text-text-light hover:text-primary transition-colors">
              Continue Browsing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success ───
  if (state === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-up">
        <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl text-text">Application Submitted!</h1>
          <p className="mt-2 text-text-light">
            Your application for <span className="font-medium text-text">{job?.title}</span> at{" "}
            <span className="font-medium text-text">{job?.company?.company_name}</span> has been sent.
          </p>
          <p className="mt-1 text-sm text-text-light">
            The employer will review your profile and CV. You&apos;ll be able to track the status from your dashboard.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/applications" className="btn-primary text-sm">
              View My Applications
            </Link>
            <Link href="/jobs" className="text-sm font-medium text-text-light hover:text-primary transition-colors">
              Continue Browsing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (state === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-up">
        <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8">
          {/* Job header */}
          {job && (
            <div className="mb-6 pb-6 border-b border-border">
              <p className="text-sm text-text-light">{job.company?.company_name}</p>
              <h1 className="font-display text-xl text-text">{job.title}</h1>
              <p className="text-sm text-text-light mt-1">{job.location}</p>
            </div>
          )}

          <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>

          <button
            onClick={() => setState("ready")}
            className="btn-primary text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ─── Ready: Application form ───
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 animate-fade-up">
      {/* Back to job */}
      <Link
        href={`/jobs/${jobId}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-light hover:text-primary transition-colors mb-6 link-animated"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to job listing
      </Link>

      <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8">
        {/* Job header */}
        <div className="mb-6 pb-6 border-b border-border">
          <p className="text-sm font-medium text-primary">{job?.company?.company_name}</p>
          <h1 className="font-display text-xl sm:text-2xl text-text mt-1">{job?.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-light">
            <span className="inline-flex items-center gap-1">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {job?.location}
            </span>
            <span className="text-border">|</span>
            <span className="capitalize">{job?.job_type?.replace("_", " ")}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div>
              <label htmlFor="cover_letter" className="block text-sm font-medium text-text mb-1.5">
                Cover Letter <span className="text-text-light font-normal">(optional)</span>
              </label>
              <textarea
                id="cover_letter"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="Tell the employer why you're a great fit for this role..."
                className="w-full rounded-[--radius-button] border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-y"
              />
              <p className="mt-1 text-xs text-text-muted text-right">{coverLetter.length}/2000</p>
            </div>

            {/* Info notice */}
            <div className="rounded-lg bg-bg-alt p-4">
              <p className="text-xs text-text-light leading-relaxed">
                By submitting this application, you consent to sharing your profile information (name, contact details, and CV) with the employer for this position.
                Your data will only be used for recruitment purposes.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={state === "submitting"}
              className="flex w-full items-center justify-center btn-warm text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {state === "submitting" ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
