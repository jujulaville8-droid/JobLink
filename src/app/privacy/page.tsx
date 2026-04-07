export const metadata = {
  title: 'Privacy Policy',
  description: 'JobLinks privacy policy. How we collect, use, and protect your data.',
  alternates: { canonical: 'https://joblinkantigua.com/privacy' },
  openGraph: {
    title: 'Privacy Policy | JobLinks',
    description: 'JobLinks privacy policy. How we collect, use, and protect your data.',
    url: 'https://joblinkantigua.com/privacy',
    siteName: 'JobLinks',
  },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold font-display text-primary mb-2">
          Privacy Policy
        </h1>
        <p className="text-text-light mb-10">Last updated: March 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              1. Information We Collect
            </h2>
            <p className="text-text-light leading-relaxed">
              When you create an account on JobLinks, we collect your email
              address and the information you provide in your profile, including
              your name, phone number, location, skills, work experience,
              education, and uploaded documents such as your CV and cover
              letters. Employers provide company information including company
              name, description, industry, and logo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              2. How We Use Your Information
            </h2>
            <ul className="list-disc pl-5 text-text-light space-y-2">
              <li>To create and manage your account</li>
              <li>To display your profile to employers when you apply for jobs</li>
              <li>To match you with relevant job opportunities</li>
              <li>To send you email notifications about applications, job alerts, and platform updates</li>
              <li>To enable employers to review applicants for their job listings</li>
              <li>To improve and maintain the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              3. Profile Visibility
            </h2>
            <p className="text-text-light leading-relaxed">
              Job seekers have full control over their profile visibility. You
              can choose to be &quot;Actively Looking&quot; (visible to all
              employers), &quot;Open to Opportunities&quot; (visible only when
              you apply), or &quot;Not Looking&quot; (completely hidden from
              employer searches). When you apply to a job, the employer for that
              specific listing can see your profile regardless of your
              visibility setting.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              4. Data Storage and Security
            </h2>
            <p className="text-text-light leading-relaxed">
              Your data is stored securely using Supabase, a managed database
              platform with encryption at rest and in transit. Uploaded files
              (CVs, cover letters, logos) are stored in secure cloud storage.
              We implement row-level security policies to ensure users can only
              access data they are authorized to view.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              5. Data Sharing
            </h2>
            <p className="text-text-light leading-relaxed">
              We do not sell your personal data to third parties. Your profile
              information is shared with employers only in accordance with your
              visibility settings and when you apply to their job listings. We
              may share anonymized, aggregate data for analytics purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              6. Cookies
            </h2>
            <p className="text-text-light leading-relaxed">
              We use essential cookies to maintain your login session and
              remember your preferences. We do not use third-party tracking
              cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              7. Your Rights
            </h2>
            <ul className="list-disc pl-5 text-text-light space-y-2">
              <li>Access and download your personal data</li>
              <li>Update or correct your information at any time</li>
              <li>Delete your account and all associated data</li>
              <li>Change your profile visibility settings</li>
              <li>Opt out of non-essential email notifications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              8. Contact Us
            </h2>
            <p className="text-text-light leading-relaxed">
              If you have questions about this privacy policy or your data,
              contact us at{' '}
              <a
                href="mailto:hello@joblinkantigua.com"
                className="text-primary-light hover:underline"
              >
                hello@joblinkantigua.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
