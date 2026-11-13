import Link from "next/link";
import { safeJsonLd } from "@/lib/safe-sql";
import {
  JOBS_INDEX_LINKS,
  jobsIndexFaq,
  jobsIndexFaqSchema,
  jobsIndexIntro,
  type JobsIndexFacts,
} from "@/lib/seo/jobs-index";

const textLink = "font-medium text-primary underline underline-offset-2";

export function JobsIndexIntro({ facts }: { facts: JobsIndexFacts | null }) {
  return (
    <div className="mt-2 max-w-3xl space-y-3 text-base leading-relaxed text-text-light sm:text-lg">
      {jobsIndexIntro(facts).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        See{" "}
        <Link href={JOBS_INDEX_LINKS.partTime} className={textLink}>part-time jobs</Link>
        {", "}
        <Link href={JOBS_INDEX_LINKS.hospitality} className={textLink}>hospitality jobs</Link>
        {" and "}
        <Link href={JOBS_INDEX_LINKS.restaurant} className={textLink}>restaurant jobs</Link>
        {", or "}
        <Link href={JOBS_INDEX_LINKS.employers} className={textLink}>post a job free</Link>
        .
      </p>
    </div>
  );
}

const relatedLinks = [
  [JOBS_INDEX_LINKS.partTime, "Part-time jobs"],
  [JOBS_INDEX_LINKS.hospitality, "Tourism & Hospitality"],
  [JOBS_INDEX_LINKS.restaurant, "Food & Beverage"],
  [JOBS_INDEX_LINKS.employers, "Post a job free"],
  [JOBS_INDEX_LINKS.hiringHelp, "Hiring help"],
  [JOBS_INDEX_LINKS.about, "About JobLink"],
] as const;

export function JobsIndexFaq({ facts, className = "" }: { facts: JobsIndexFacts | null; className?: string }) {
  const items = jobsIndexFaq(facts);
  return (
    <section aria-labelledby="jobs-faq" className={`mt-10 border-t border-border pt-8 ${className}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jobsIndexFaqSchema(items)) }} />
      <h2 id="jobs-faq" className="font-display text-2xl leading-tight text-text">
        Questions about jobs in Antigua and Barbuda
      </h2>
      <div className="mt-5 max-w-3xl space-y-5">
        {items.map((item) => (
          <div key={item.question}>
            <h3 className="text-base font-semibold text-text">{item.question}</h3>
            <p className="mt-1 text-base leading-relaxed text-text-light">
              {item.parts.map((part, index) => part.href ? (
                <Link key={`${part.href}-${index}`} href={part.href} className={textLink}>{part.text}</Link>
              ) : (
                <span key={`${part.text}-${index}`}>{part.text}</span>
              ))}
            </p>
          </div>
        ))}
      </div>
      <nav aria-label="Related JobLink pages" className="mt-8">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {relatedLinks.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="text-sm font-medium text-primary underline underline-offset-2">{label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
