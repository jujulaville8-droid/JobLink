"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ShareableJob {
  id: string;
  title: string;
  company_name: string;
  location: string;
  job_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_visible: boolean;
  created_at: string;
}

interface Props {
  jobs: ShareableJob[];
}

function generatePostText(job: ShareableJob): string {
  let salary = "";
  if (job.salary_visible && job.salary_min) {
    salary = job.salary_max
      ? `💰 $${job.salary_min.toLocaleString()} – $${job.salary_max.toLocaleString()}`
      : `💰 From $${job.salary_min.toLocaleString()}`;
  }

  const lines = [
    `🚨 NOW HIRING: ${job.title}`,
    "",
    `🏢 ${job.company_name}`,
    `📍 ${job.location}`,
    `📋 ${job.job_type}`,
  ];

  if (salary) lines.push(salary);

  lines.push(
    "",
    `Apply now 👉 https://joblinkantigua.com/jobs/${job.id}`,
    "",
    "#AntiguaJobs #JobLinks #NowHiring #AntiguaAndBarbuda #CaribbeanJobs"
  );

  return lines.join("\n");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const FB_GROUP_URL = "https://www.facebook.com/share/g/1Dr8yXBFbE/";

export default function ShareToFacebook({ jobs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleShare(jobId: string, postText: string) {
    await navigator.clipboard.writeText(postText);
    setCopiedId(jobId);
    setTimeout(() => setCopiedId(null), 3000);
    window.open(FB_GROUP_URL, "_blank", "noopener,noreferrer");
  }

  if (jobs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-text-muted">
        No active jobs to share.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {jobs.map((job) => {
        const postText = generatePostText(job);
        const isExpanded = expandedId === job.id;
        const isCopied = copiedId === job.id;

        return (
          <div key={job.id} className="px-5 py-3 hover:bg-bg-alt/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/40 flex items-center justify-center shrink-0">
                <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{job.title}</p>
                <p className="text-xs text-text-muted">
                  {job.company_name} &middot; {job.location}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
                >
                  <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  Preview
                </button>
                <button
                  onClick={() => handleShare(job.id, postText)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors ${isCopied ? "bg-emerald-500" : "bg-[#1877F2] hover:bg-[#166FE5]"}`}
                >
                  {isCopied ? (
                    <>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied & Opened
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Share to Group
                    </>
                  )}
                </button>
              </div>
            </div>

            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 ml-11"
              >
                <div className="rounded-lg bg-bg-alt border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Post Preview</span>
                    <CopyButton text={postText} />
                  </div>
                  <pre className="text-xs text-text whitespace-pre-wrap font-sans leading-relaxed">
                    {postText}
                  </pre>
                </div>
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}
