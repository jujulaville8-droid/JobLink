"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick01Icon,
  Alert01Icon,
  Cancel01Icon,
  ArrowLeft01Icon,
  Briefcase01Icon,
  Location01Icon,
  Clock01Icon,
  File01Icon,
  UserIcon,
  SentIcon,
  ViewIcon,
  Search01Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
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

const cardBase =
  "rounded-2xl border border-border/40 bg-[--color-surface] overflow-hidden transition-all duration-300 shadow-xs";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const },
  },
};

const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-primary/20";

const btnOutline =
  "inline-flex items-center gap-2 rounded-xl border-2 border-border bg-[--color-surface] px-5 py-2.5 text-sm font-medium text-text-light hover:text-primary hover:border-primary/30 transition-all duration-200";

export default function ApplyPage() {
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
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = `/login?returnTo=/jobs/${jobId}/apply`;
        return;
      }

      const { data: jobData, error: jobError } = await supabase
        .from("job_listings")
        .select(
          "id, title, location, job_type, status, company:companies(company_name)"
        )
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

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!userData || userData.role !== "seeker") {
        setState("not-seeker");
        return;
      }

      const { data: profile } = await supabase
        .from("seeker_profiles")
        .select("id, first_name, last_name, phone, cv_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        setProfileStatus({
          hasProfile: false,
          missingFields: ["Profile not created"],
          seekerId: null,
        });
        setState("profile-incomplete");
        return;
      }

      const missing: string[] = [];
      if (!profile.first_name) missing.push("First name");
      if (!profile.last_name) missing.push("Last name");
      if (!profile.phone) missing.push("Phone number");
      if (!profile.cv_url) missing.push("CV/Resume upload");

      if (missing.length > 0) {
        setProfileStatus({
          hasProfile: true,
          missingFields: missing,
          seekerId: profile.id,
        });
        setState("profile-incomplete");
        return;
      }

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

      setProfileStatus({
        hasProfile: true,
        missingFields: [],
        seekerId: profile.id,
      });
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
        setErrorMessage(
          data.error || "Something went wrong. Please try again."
        );
        setState("error");
        return;
      }

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
      setState("success");
    } catch {
      setErrorMessage(
        "Network error. Please check your connection and try again."
      );
      setState("error");
    }
  }

  // ─── Loading ───
  if (state === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mb-4">
            <div className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-primary border-t-transparent" />
          </div>
          <p className="text-sm text-text-muted">Loading application...</p>
        </motion.div>
      </div>
    );
  }

  // ─── Job not found ───
  if (state === "job-not-found") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div
            variants={item}
            className={cn(cardBase, "p-8 text-center")}
          >
            <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <HugeiconsIcon
                icon={Cancel01Icon}
                size={24}
                className="text-red-500"
              />
            </div>
            <h1 className="font-display text-2xl font-bold text-text">
              Job Not Found
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              This listing may have been removed or is no longer active.
            </p>
            <Link href="/jobs" className={cn(btnPrimary, "mt-6")}>
              <HugeiconsIcon icon={Search01Icon} size={14} />
              Browse all jobs
            </Link>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Job header component (reused across states) ───
  const jobHeader = job && (
    <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3 bg-white">
      <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
        <HugeiconsIcon icon={Briefcase01Icon} size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{job.title}</p>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          {job.company?.company_name && (
            <span className="font-medium text-primary/80">{job.company.company_name}</span>
          )}
          {job.location && (
            <>
              <span>&middot;</span>
              <span className="inline-flex items-center gap-0.5">
                <HugeiconsIcon icon={Location01Icon} size={10} />
                {job.location}
              </span>
            </>
          )}
          {job.job_type && (
            <>
              <span>&middot;</span>
              <span className="capitalize">
                {job.job_type.replace("_", " ")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Job closed ───
  if (state === "job-closed") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div variants={item} className={cardBase}>
            {jobHeader}
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon
                  icon={Clock01Icon}
                  size={24}
                  className="text-red-500"
                />
              </div>
              <h1 className="font-display text-xl font-bold text-text">
                Applications Closed
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                This job is no longer accepting applications.
              </p>
              <Link href="/jobs" className={cn(btnPrimary, "mt-6")}>
                <HugeiconsIcon icon={Search01Icon} size={14} />
                Browse other jobs
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Not a seeker ───
  if (state === "not-seeker") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div variants={item} className={cardBase}>
            {jobHeader}
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon
                  icon={UserIcon}
                  size={24}
                  className="text-blue-600"
                />
              </div>
              <h1 className="font-display text-xl font-bold text-text">
                Employer Account
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                Only job seekers can apply to listings. Switch to your seeker
                account to apply.
              </p>
              <Link href="/dashboard" className={cn(btnPrimary, "mt-6")}>
                Go to Dashboard
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Profile incomplete ───
  if (state === "profile-incomplete") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div variants={item} className={cardBase}>
            {jobHeader}
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={24}
                  className="text-amber-600"
                />
              </div>
              <h1 className="font-display text-xl font-bold text-text">
                Complete Your Profile
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                Please complete the following before applying:
              </p>

              <div className="mt-5 space-y-2">
                {profileStatus.missingFields.map((field, i) => (
                  <motion.div
                    key={field}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i, duration: 0.3 }}
                    className="flex items-center gap-2.5 rounded-xl bg-amber-50/60 border border-amber-200/40 px-4 py-2.5 mx-auto max-w-xs"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <HugeiconsIcon
                        icon={Alert01Icon}
                        size={12}
                        className="text-amber-600"
                      />
                    </div>
                    <span className="text-sm font-medium text-amber-800">
                      {field}
                    </span>
                  </motion.div>
                ))}
              </div>

              <Link
                href={`/profile?returnTo=/jobs/${jobId}/apply`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-amber-500/20"
              >
                <HugeiconsIcon icon={UserIcon} size={14} />
                Complete Profile
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Already applied ───
  if (state === "already-applied") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div variants={item} className={cardBase}>
            {jobHeader}
            <div className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.4, delay: 0.2 }}
                className="w-14 h-14 rounded-xl bg-primary/5 flex items-center justify-center mx-auto mb-4"
              >
                <HugeiconsIcon
                  icon={Tick01Icon}
                  size={24}
                  className="text-primary"
                />
              </motion.div>
              <h1 className="font-display text-xl font-bold text-text">
                Already Applied
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                You&apos;ve already submitted your application for this
                position.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/applications" className={btnPrimary}>
                  <HugeiconsIcon icon={ViewIcon} size={14} />
                  View My Applications
                </Link>
                <Link href="/jobs" className={btnOutline}>
                  <HugeiconsIcon icon={Search01Icon} size={14} />
                  Continue Browsing
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Success ───
  if (state === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 animate-in fade-in duration-500">
        <div className="space-y-4">
          {/* Success banner */}
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={Tick01Icon} size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">
                Success! Your application has been sent.
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                The employer has been notified.
              </p>
            </div>
          </div>

          <div className={cardBase}>
            {/* Job header with light background for both modes */}
            {job && (
              <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3 bg-white">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={Briefcase01Icon} size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{job.title}</p>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    {job.company?.company_name && (
                      <span className="font-medium text-primary/80">{job.company.company_name}</span>
                    )}
                    {job.location && (
                      <>
                        <span>&middot;</span>
                        <span className="inline-flex items-center gap-0.5">
                          <HugeiconsIcon icon={Location01Icon} size={10} />
                          {job.location}
                        </span>
                      </>
                    )}
                    {job.job_type && (
                      <>
                        <span>&middot;</span>
                        <span className="capitalize">
                          {job.job_type.replace("_", " ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <HugeiconsIcon
                  icon={SentIcon}
                  size={28}
                  className="text-emerald-600"
                />
              </div>
              <h1 className="font-display text-xl font-bold text-text">
                Application Submitted!
              </h1>
              <p className="mt-2 text-sm text-text-muted max-w-sm mx-auto">
                Your application for{" "}
                <span className="font-medium text-text">{job?.title}</span> at{" "}
                <span className="font-medium text-text">
                  {job?.company?.company_name}
                </span>{" "}
                has been sent.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                The employer will review your profile and CV. Track the status
                from your dashboard.
              </p>

              {/* Progress indicator */}
              <div className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-border/30 px-5 py-3.5 mx-auto max-w-xs">
                {["Applied", "Reviewed", "Decision"].map((step, i) => (
                  <div key={step} className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                        i === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-text-muted"
                      )}
                    >
                      {i === 0 ? (
                        <HugeiconsIcon icon={Tick01Icon} size={14} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        i === 0 ? "text-emerald-700" : "text-text-muted"
                      )}
                    >
                      {step}
                    </span>
                    {i < 2 && (
                      <div className="w-5 h-px bg-border mx-0.5" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                {conversationId && (
                  <Link
                    href={`/messages/${conversationId}`}
                    className={btnPrimary}
                  >
                    <HugeiconsIcon icon={Message01Icon} size={14} />
                    Message Employer
                  </Link>
                )}
                <Link
                  href="/applications"
                  className={conversationId ? btnOutline : btnPrimary}
                >
                  <HugeiconsIcon icon={ViewIcon} size={14} />
                  View My Applications
                </Link>
                <Link href="/jobs" className={btnOutline}>
                  <HugeiconsIcon icon={Search01Icon} size={14} />
                  Continue Browsing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (state === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <motion.div variants={item} className={cardBase}>
            {jobHeader}
            <div className="p-6">
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200/40 p-4 mb-5">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={14}
                    className="text-red-600"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-red-800">
                    Submission Failed
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                onClick={() => setState("ready")}
                className={btnPrimary}
              >
                Try Again
              </button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Ready: Application form ───
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-primary transition-colors mb-6"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Back to job listing
        </Link>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-5"
      >
        {/* Page heading */}
        <motion.div variants={item}>
          <h1 className="font-display text-2xl font-bold text-text">
            Submit Your Application
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Review the details below and add an optional cover letter.
          </p>
        </motion.div>

        {/* Job info card */}
        <motion.div
          variants={item}
          className={cn(cardBase, "border-l-4 border-l-primary")}
        >
          <div className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
              <HugeiconsIcon
                icon={Briefcase01Icon}
                size={22}
                className="text-primary"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted font-medium uppercase tracking-wide">
                Applying for
              </p>
              <h2 className="text-lg font-bold text-text truncate mt-0.5">
                {job?.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted mt-1">
                {job?.company?.company_name && (
                  <span className="font-medium text-primary">
                    {job.company.company_name}
                  </span>
                )}
                {job?.location && (
                  <>
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-0.5">
                      <HugeiconsIcon icon={Location01Icon} size={10} />
                      {job.location}
                    </span>
                  </>
                )}
                {job?.job_type && (
                  <>
                    <span>&middot;</span>
                    <span className="inline-flex items-center rounded-full bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {job.job_type.replace("_", " ")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* What gets shared info */}
        <motion.div
          variants={item}
          className="flex items-center gap-3 rounded-xl bg-primary/4 border border-primary/10 px-4 py-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={UserIcon} size={14} className="text-primary" />
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Your <span className="font-medium text-text">profile</span>,{" "}
            <span className="font-medium text-text">contact details</span>, and{" "}
            <span className="font-medium text-text">CV</span> will be shared
            automatically with the employer.
          </p>
        </motion.div>

        {/* Application form card */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2.5 bg-bg-alt/30">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <HugeiconsIcon
                icon={File01Icon}
                size={16}
                className="text-primary"
              />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">
                Cover Letter
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Optional — but a good one helps you stand out
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Cover letter */}
            <div>
              <textarea
                id="cover_letter"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={7}
                maxLength={2000}
                placeholder="Tell the employer why you're a great fit for this role..."
                className="w-full rounded-xl border border-border/60 bg-[--color-bg] px-4 py-3.5 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 resize-y leading-relaxed"
              />
              <div className="mt-1.5 flex items-center justify-end">
                <p
                  className={cn(
                    "text-xs tabular-nums transition-colors",
                    coverLetter.length > 1800
                      ? "text-amber-600"
                      : "text-text-muted"
                  )}
                >
                  {coverLetter.length.toLocaleString()}/2,000
                </p>
              </div>
            </div>

            {/* Consent notice */}
            <div className="flex items-start gap-3 rounded-xl bg-bg-alt/60 border border-border/30 p-4">
              <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={13}
                  className="text-primary"
                />
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                By submitting this application, you consent to sharing your
                profile information with the employer for recruitment purposes
                only.
              </p>
            </div>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={state === "submitting"}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent-warm px-6 py-3.5 text-base font-semibold text-white hover:bg-accent-warm-hover transition-all duration-200 hover:shadow-lg hover:shadow-accent-warm/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {state === "submitting" ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={SentIcon} size={18} />
                  Submit Application
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}
