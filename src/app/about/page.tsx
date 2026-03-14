import Link from 'next/link'

export const metadata = {
  title: 'About — JobLink',
  description: 'Learn about JobLink, Antigua\'s first dedicated job platform.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#095355] to-[#0d7377] text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold font-display mb-4">
            Made in Antigua, for Antigua
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
            JobLink is the first dedicated job platform built specifically for
            Antigua and Barbuda. We&apos;re here to connect job seekers with
            employers across every industry on the island.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#0d7377] mb-6">
            Why JobLink?
          </h2>
          <div className="space-y-4 text-[#71717a] text-lg leading-relaxed">
            <p>
              For years, Antiguans have relied on Facebook groups and word of
              mouth to find jobs. While platforms like Indeed and LinkedIn serve
              the global market, they don&apos;t understand the Antiguan economy
              — our industries, our communities, our way of doing things.
            </p>
            <p>
              JobLink changes that. We&apos;ve built a professional, structured
              platform that understands the local job market — from Tourism &
              Hospitality to Government & Civil Service, from seasonal hotel
              work to full-time banking roles.
            </p>
            <p>
              Whether you&apos;re a job seeker looking for your next opportunity
              or an employer searching for the right candidate, JobLink makes
              the process simple, professional, and effective.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-[#faf9f7]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#0d7377] mb-10 text-center">
            How It Works
          </h2>
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-semibold text-[#0d7377] mb-4">
                For Job Seekers
              </h3>
              <ol className="space-y-4 text-[#71717a]">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#14919b] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    1
                  </span>
                  <span>Create your free profile with your skills and experience</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#14919b] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    2
                  </span>
                  <span>Browse jobs filtered by industry, location, and type</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#14919b] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </span>
                  <span>Apply with one click using your saved profile and CV</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#14919b] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    4
                  </span>
                  <span>Track your applications and get notified of updates</span>
                </li>
              </ol>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-[#0d7377] mb-4">
                For Employers
              </h3>
              <ol className="space-y-4 text-[#71717a]">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#0d7377] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    1
                  </span>
                  <span>Create your company profile</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#0d7377] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    2
                  </span>
                  <span>Post job listings with all the details candidates need</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#0d7377] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </span>
                  <span>Review applicants, view profiles, and download CVs</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#0d7377] text-white rounded-full flex items-center justify-center font-bold text-sm">
                    4
                  </span>
                  <span>Shortlist, reject, or hire — candidates are notified instantly</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#0d7377] mb-4">
            Get in Touch
          </h2>
          <p className="text-[#71717a] mb-8 max-w-lg mx-auto">
            Have questions, feedback, or partnership enquiries? We&apos;d love
            to hear from you.
          </p>
          <a
            href="mailto:hello@joblinkantigua.com"
            className="inline-block bg-[#14919b] hover:bg-[#0d7377] text-white font-semibold px-8 py-3 rounded-full transition-colors"
          >
            Contact Us
          </a>
          <div className="mt-12 grid sm:grid-cols-2 gap-6 max-w-md mx-auto text-left">
            <div>
              <h4 className="font-semibold text-[#0d7377] mb-1">Email</h4>
              <p className="text-[#71717a]">hello@joblinkantigua.com</p>
            </div>
            <div>
              <h4 className="font-semibold text-[#0d7377] mb-1">Location</h4>
              <p className="text-[#71717a]">St. John&apos;s, Antigua</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0d7377] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold font-display mb-4">
            Ready to get started?
          </h2>
          <p className="text-white/70 mb-8">
            Join hundreds of Antiguans already using JobLink.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-[#14919b] hover:bg-[#0d7377] text-white font-semibold px-8 py-3 rounded-full transition-colors text-center"
            >
              Find a Job
            </Link>
            <Link
              href="/signup"
              className="border border-white/30 text-white hover:bg-white hover:text-[#0d7377] font-semibold px-8 py-3 rounded-full transition-colors text-center"
            >
              Post a Job
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
