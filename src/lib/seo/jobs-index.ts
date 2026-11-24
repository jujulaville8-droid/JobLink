import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { closedJobIdFilter } from "@/lib/job-closures";
import { INDUSTRIES } from "@/lib/types";

/** Public /jobs index heading. Category pages keep their own headings. */
export const JOBS_INDEX_H1 = "Jobs in Antigua and Barbuda";

export const JOBS_INDEX_LINKS = {
  partTime: "/jobs?job_type=part_time",
  hospitality: `/jobs?category=${encodeURIComponent("Tourism & Hospitality")}`,
  restaurant: `/jobs?category=${encodeURIComponent("Food & Beverage")}`,
  employers: "/employers",
  hiringHelp: "/employers/hiring-help",
  about: "/about",
} as const;

export interface JobsIndexFacts {
  openJobs: number;
  employersHiring: number;
  partTimeJobs: number;
  /** Named industries with at least one open job, largest first. */
  categories: { name: string; count: number }[];
}

export interface FaqPart {
  text: string;
  href?: string;
}

export interface FaqItem {
  question: string;
  parts: FaqPart[];
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

function jobsWord(count: number): string {
  return count === 1 ? "job" : "jobs";
}

function openJobLabel(count: number): string {
  return `${count} open ${jobsWord(count)}`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Open roles use the same rule as the public results list: status active, and
 * not on the closure list. A failed read returns null so the page never
 * publishes a zero that it did not actually count.
 */
export const getJobsIndexFacts = cache(async (): Promise<JobsIndexFacts | null> => {
  try {
    const supabase = await createClient();
    const counts = new Map<string, number>();
    const companies = new Set<string>();
    let openJobs = 0;
    let partTimeJobs = 0;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const start = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("job_listings")
        .select("category, job_type, company_id")
        .eq("status", "active")
        .not("id", "in", closedJobIdFilter())
        .order("id")
        .range(start, start + PAGE_SIZE - 1);
      if (error) return null;

      const rows = data ?? [];
      for (const job of rows) {
        openJobs += 1;
        if (typeof job.company_id === "string" && job.company_id) companies.add(job.company_id);
        if (job.job_type === "part_time") partTimeJobs += 1;
        if (typeof job.category === "string" && INDUSTRIES.includes(job.category)) {
          counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
        }
      }
      if (rows.length < PAGE_SIZE) {
        return {
          openJobs,
          employersHiring: companies.size,
          partTimeJobs,
          categories: [...counts]
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, count]) => ({ name, count })),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
});

export function jobsIndexTitle(openJobs: number | null): string {
  if (openJobs === null) return JOBS_INDEX_H1;
  const vacancies = openJobs === 1 ? "Vacancy" : "Vacancies";
  return `${JOBS_INDEX_H1}: ${openJobs} Open ${vacancies}`;
}

export function jobsIndexDescription(openJobs: number | null): string {
  const count = openJobs === null ? "jobs" : `${openJobs} ${jobsWord(openJobs)}`;
  return `Browse ${count} in Antigua and Barbuda. Filter by industry, location, or job type and apply free on JobLink, the local job board. Employers can post free.`;
}

export function jobsIndexIntro(facts: JobsIndexFacts | null): string[] {
  if (!facts) {
    return [
      "JobLink lists open jobs in Antigua and Barbuda. Filter by industry, town or area, or full-time and part-time, then apply free. Employers can post a job free.",
    ];
  }

  const hiring = facts.employersHiring > 0
    ? ` ${facts.employersHiring === 1 ? "1 employer is hiring." : `${facts.employersHiring} employers are hiring.`}`
    : "";
  const paragraphs = [
    `JobLink lists ${openJobLabel(facts.openJobs)} in Antigua and Barbuda right now.${hiring}`,
    "Filter by industry, town or area, or full-time and part-time, then apply free. Employers can post a job free.",
  ];
  const largest = facts.categories.filter((category) => category.count > 0).slice(0, 3);
  if (largest.length) {
    const list = formatList(largest.map((category) => `${category.name} (${openJobLabel(category.count)})`));
    paragraphs.push(
      largest.length === 1
        ? `The largest group with open jobs is ${list}.`
        : `The largest groups with open jobs are ${list}.`,
    );
  }
  return paragraphs;
}

export function faqPlainText(item: FaqItem): string {
  return item.parts.map((part) => part.text).join("");
}

export function jobsIndexFaq(facts: JobsIndexFacts | null): FaqItem[] {
  const items: FaqItem[] = [
    {
      question: "Where can I find jobs in Antigua and Barbuda?",
      parts: [{
        text: "JobLink is a free job board for Antigua and Barbuda. Open roles are listed on this page. You can filter by industry, location, and job type, then apply on the site.",
      }],
    },
  ];

  if (facts) {
    items.push({
      question: "How many jobs are open in Antigua right now?",
      parts: [{ text: `JobLink lists ${openJobLabel(facts.openJobs)} in Antigua and Barbuda right now.` }],
    });
  }

  items.push({
    question: "Is it free to apply or post a job?",
    parts: [{ text: "Yes. Job seekers can browse and apply free. Employers can post a job free." }],
  });

  const named = facts?.categories.filter((category) => category.count > 0) ?? [];
  if (named.length) {
    const list = formatList(named.map((category) => `${category.name} (${openJobLabel(category.count)})`));
    items.push({
      question: "What kinds of jobs are listed?",
      parts: [{ text: `Open jobs include ${list}.` }],
    });
  } else if (facts && facts.openJobs === 0) {
    items.push({
      question: "What kinds of jobs are listed?",
      parts: [{ text: "No open jobs are listed right now." }],
    });
  }

  if (facts) {
    const jobs = jobsWord(facts.openJobs);
    const none = facts.openJobs === 0
      ? ". None of the open jobs are tagged Part Time right now."
      : `. None of the ${facts.openJobs} open ${jobs} ${facts.openJobs === 1 ? "is" : "are"} tagged Part Time right now.`;
    const some = `. Right now, ${facts.partTimeJobs} of ${facts.openJobs} open ${jobs} ${facts.partTimeJobs === 1 ? "is" : "are"} tagged Part Time.`;
    items.push({
      question: "Are there part-time jobs in Antigua?",
      parts: [
        { text: "Listings can be filtered by " },
        { text: "Part Time", href: JOBS_INDEX_LINKS.partTime },
        { text: facts.partTimeJobs === 0 ? none : some },
      ],
    });
  }

  items.push(
    {
      question: "How do I apply?",
      parts: [{
        text: "Open a job on this page, then use Apply on the listing. Submitting an application requires a JobLink account.",
      }],
    },
    {
      question: "How do I post a job?",
      parts: [
        { text: "Employers can post a job free from the " },
        { text: "employers page", href: JOBS_INDEX_LINKS.employers },
        { text: " or request " },
        { text: "hiring help", href: JOBS_INDEX_LINKS.hiringHelp },
        { text: "." },
      ],
    },
    {
      question: "Does JobLink cover Barbuda as well as Antigua?",
      parts: [{
        text: "Yes. JobLink lists jobs for Antigua and Barbuda. You can search this page by town or area, including Barbuda.",
      }],
    },
  );

  return items;
}

export function jobsIndexFaqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqPlainText(item),
      },
    })),
  };
}
