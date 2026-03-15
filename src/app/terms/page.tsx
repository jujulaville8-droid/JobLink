export const metadata = {
  title: 'Terms of Service — JobLinks',
  description: 'JobLinks terms of service. Rules and guidelines for using our platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold font-display text-[#0d7377] mb-2">
          Terms of Service
        </h1>
        <p className="text-text-light mb-10">Last updated: March 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-text-light leading-relaxed">
              By accessing or using JobLinks (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform. JobLinks is operated for the benefit of job seekers and employers in Antigua and Barbuda.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              2. User Accounts
            </h2>
            <p className="text-text-light leading-relaxed">
              You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 16 years old to use the Platform. One person may maintain one job seeker account and one employer account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              3. Job Seekers
            </h2>
            <p className="text-text-light leading-relaxed">
              Job seekers may create profiles, upload resumes, search for jobs, and apply to listings. You agree that all information in your profile and applications is truthful and accurate. You may not apply to jobs using false credentials or misrepresent your qualifications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              4. Employers
            </h2>
            <p className="text-text-light leading-relaxed">
              Employers may create company profiles and post job listings. All listings are subject to review and approval. Job postings must be for legitimate, legal employment opportunities in Antigua and Barbuda. Employers may not post misleading listings, discriminatory requirements, or listings for illegal activities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              5. Content Guidelines
            </h2>
            <p className="text-text-light leading-relaxed">
              Users may not post content that is offensive, harassing, discriminatory, fraudulent, or illegal. JobLinks reserves the right to remove any content and suspend or ban accounts that violate these guidelines. Messages between users must remain professional and relevant to employment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              6. Privacy
            </h2>
            <p className="text-text-light leading-relaxed">
              Your use of the Platform is also governed by our{' '}
              <a href="/privacy" className="text-[#0d7377] underline hover:text-[#095355]">Privacy Policy</a>.
              By using the Platform, you consent to the collection and use of your data as described therein.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              7. Intellectual Property
            </h2>
            <p className="text-text-light leading-relaxed">
              The JobLinks name, logo, and platform design are the property of JobLinks. Users retain ownership of the content they upload (resumes, job descriptions, etc.) but grant JobLinks a license to display this content on the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              8. Limitation of Liability
            </h2>
            <p className="text-text-light leading-relaxed">
              JobLinks is a platform that connects job seekers and employers. We do not guarantee employment outcomes, verify employer legitimacy beyond our review process, or take responsibility for interactions between users outside the Platform. The Platform is provided &ldquo;as is&rdquo; without warranties of any kind.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              9. Account Termination
            </h2>
            <p className="text-text-light leading-relaxed">
              JobLinks may suspend or terminate accounts that violate these terms, engage in fraudulent activity, or are reported by other users. Users may delete their accounts at any time through the Settings page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              10. Changes to Terms
            </h2>
            <p className="text-text-light leading-relaxed">
              We may update these terms from time to time. Continued use of the Platform after changes constitutes acceptance of the updated terms. We will notify users of significant changes via email or platform notification.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0d7377] mb-3">
              11. Contact
            </h2>
            <p className="text-text-light leading-relaxed">
              For questions about these terms, contact us at{' '}
              <a href="mailto:support@joblinkantigua.com" className="text-[#0d7377] underline hover:text-[#095355]">
                support@joblinkantigua.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
