import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, MapPin, ChevronDown, Sprout } from "lucide-react";
import type { Job } from "@/components/JobCard";

export default function HomePage({ jobs, preview = false }: { jobs: Job[]; preview?: boolean }) {
  return <div className="local-roots-home">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-art"><Image src="/images/home/hero-collage.png" alt="Local professionals in hospitality, skilled trades and food service, with an Antigua harbour view" fill priority sizes="(max-width: 700px) 100vw, 55vw" /></div>
      <div className="home-hero-copy">
        <p className="home-eyebrow">Opportunity, close to home</p>
        <h1 id="home-title"><span>Your next</span><span>chapter starts</span><span>here.</span></h1>
        <span className="home-coral-stroke hero-stroke" />
        <p className="home-hero-description">Find work. Meet local employers. Build your future<br className="home-desktop-break" /> in Antigua &amp; Barbuda.</p>
        <form action="/jobs" method="get" className="home-search" role="search">
          <label className="home-keyword"><Search aria-hidden="true" /><span className="sr-only">Job title or keyword</span><input name="q" placeholder="Job title or keyword" /></label>
          <label className="home-location"><MapPin aria-hidden="true" /><span className="sr-only">Location</span><select name="location" defaultValue=""><option value="">All locations</option><option>St. John&apos;s</option><option>All Saints</option><option>English Harbour</option><option>Jolly Harbour</option><option>Barbuda</option></select><ChevronDown className="home-select-arrow" aria-hidden="true" /></label>
          <button className="home-button" type="submit">Find jobs <ArrowRight aria-hidden="true" /></button>
        </form>
        <div className="home-community"><Sprout aria-hidden="true" /><p>Real people. Stronger communities.<br />A brighter Antigua &amp; Barbuda.</p></div>
      </div>
    </section>
    <nav className="home-industries" aria-label="Browse jobs by industry">
      <span>Find your field</span>
      {[
        ["Hospitality", "Tourism & Hospitality"],
        ["Skilled trades", "Construction"],
        ["Office & admin", "Administrative & Office"],
        ["Retail", "Retail & Trade"],
      ].map(([label, category]) => <Link key={category} href={"/jobs?category=" + encodeURIComponent(category)}>{label}<ArrowRight aria-hidden="true" /></Link>)}
      <Link href="/jobs">All industries<ArrowRight aria-hidden="true" /></Link>
    </nav>
    <section className="home-opportunities" aria-labelledby="opportunities-title">
      <span className="home-coral-stroke" /><div className="home-section-heading"><h2 id="opportunities-title">Find your next opportunity</h2><p className="home-eyebrow">{preview ? "Sample listings" : "Latest opportunities"}</p></div>
      <div className="home-job-grid">{jobs.map((job, index) => <Link href={preview ? "/jobs" : `/jobs/${job.id}`} className="home-job-card" key={job.id}>
        <div className={`home-job-monogram home-monogram-${index % 3}`}>{job.company_logo ? <Image src={job.company_logo} alt="" width={52} height={52} /> : job.company_name.split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</div>
        <div className="home-job-details"><h3>{job.title}</h3><p>{job.location} · {job.job_type}</p></div><span className="home-company-name">{job.company_name}</span><ArrowRight className="home-job-arrow" aria-hidden="true" />
      </Link>)}</div>
      {jobs.length === 0 && <div className="home-empty"><h3>Your next opportunity is on its way.</h3><p>New jobs will appear here as employers post them. Create your free profile to get ready.</p><Link href="/signup">Create your profile <ArrowRight aria-hidden="true" /></Link></div>}
      <Link className="home-browse" href="/jobs">Browse more jobs <ArrowRight aria-hidden="true" /></Link>
    </section>
    <section className="home-how" aria-labelledby="home-how-title">
      <div className="home-how-intro"><p className="home-eyebrow">Your next step starts here</p><h2 id="home-how-title">A little action.<br />A new beginning.</h2><Link href="/signup">Create your free profile <ArrowRight aria-hidden="true" /></Link></div>
      <ol>
        <li><span>01</span><div><h3>Tell your story</h3><p>Add your skills, experience and CV. Let local employers see what you bring.</p></div></li>
        <li><span>02</span><div><h3>Find your opportunity</h3><p>Explore jobs across the island and apply for the roles that feel right.</p></div></li>
        <li><span>03</span><div><h3>Make your next move</h3><p>Keep track of your applications and connect with employers in one place.</p></div></li>
      </ol>
    </section>
    <section className="home-employers" id="employers" aria-labelledby="employers-title">
      <div className="home-employer-photo"><Image src="/images/people-sitting.webp" alt="A job seeker speaking with recruiters at a job fair" fill sizes="(max-width: 700px) 100vw, 44vw" /></div>
      <div className="home-employer-copy"><h2 id="employers-title">Good people.<br />Great possibilities.</h2><p>Reach talented, motivated people across Antigua &amp; Barbuda.<br />Post a job and be part of what&apos;s next.</p><Link href="/post-job" className="home-button">Find your next hire <ArrowRight aria-hidden="true" /></Link></div>
    </section>
    {preview && <p className="home-preview-note">LOCAL DESIGN PREVIEW · SAMPLE LISTINGS · LIVE SITE UNCHANGED</p>}
  </div>;
}
