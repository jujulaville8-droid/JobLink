export const metadata = {
  title: 'Delete Your Account',
  description: 'How to delete your JobLink account and the personal data associated with it.',
  alternates: { canonical: 'https://joblinkantigua.com/delete-account' },
  openGraph: {
    title: 'Delete Your Account | JobLink',
    description: 'How to delete your JobLink account and the personal data associated with it.',
    url: 'https://joblinkantigua.com/delete-account',
    siteName: 'JobLink',
  },
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold font-display text-primary mb-2">
          Delete your JobLink account and data
        </h1>
        <p className="text-text-light mb-10">
          You can request deletion of your JobLink account and the personal data associated with it.
        </p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <p className="text-text-light leading-relaxed">
              Your account is shared between the JobLink app and joblinkantigua.com. Deleting it
              removes your access to both services. Uninstalling the app does not delete your
              account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              Delete it yourself in the app
            </h2>
            <p className="text-text-light leading-relaxed">
              If you have the JobLink app, you can delete your account right away:
            </p>
            <ol className="list-decimal pl-5 mt-3 text-text-light space-y-2">
              <li>Open the JobLink app and sign in.</li>
              <li>Go to the Account tab.</li>
              <li>Tap Delete account and follow the confirmation steps.</li>
            </ol>
            <p className="mt-3 text-text-light leading-relaxed">
              This deletes your account and data immediately and cannot be undone.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              Request deletion by email
            </h2>
            <p className="text-text-light leading-relaxed">
              Email{' '}
              <a
                className="text-accent underline"
                href="mailto:hello@joblinkantigua.com?subject=Account%20deletion%20request"
              >
                hello@joblinkantigua.com
              </a>{' '}
              with the subject <strong>Account deletion request</strong>.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              Send the request from the email address registered to your account and tell us that
              you want your JobLink account and associated personal data deleted. You do not need
              to give a reason.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              If you no longer have access to your registered email address, contact us at the
              same address. We will explain how we can verify ownership using the minimum
              information necessary.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              Do not send your password or copies of identity documents unless we explain why
              additional verification is necessary and provide an appropriate way to supply it.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              You can request deletion without reinstalling the app or signing in to the website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">What happens next</h2>
            <p className="text-text-light leading-relaxed">
              We will acknowledge your request and verify that it came from the account owner. If
              we need more information, we will explain what is needed.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              Once ownership is verified, we will process deletion within 30 calendar days and
              email you when it is complete. If an exceptional delay occurs, we will explain the
              reason and expected completion date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">What we delete</h2>
            <p className="text-text-light leading-relaxed">
              We delete the account and associated personal data under JobLink&rsquo;s control,
              including:
            </p>
            <ul className="list-disc pl-5 mt-3 text-text-light space-y-2">
              <li>Sign-in account information.</li>
              <li>Profile details, including name, phone, location and bio.</li>
              <li>Saved jobs.</li>
              <li>Applications, cover letters and associated personal application records.</li>
              <li>CVs and related personal documents stored for your account.</li>
              <li>
                Account-linked messages and attachments, subject to any specifically disclosed
                retention requirement.
              </li>
            </ul>
            <p className="mt-3 text-text-light leading-relaxed">
              For employer accounts, we will also address associated company and listing records.
              Where records affect another account or must be retained, we will explain the
              handling before completing the request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              Information already sent to employers
            </h2>
            <p className="text-text-light leading-relaxed">
              An employer may already have downloaded or separately stored your application or
              CV. Deleting your JobLink account does not automatically erase copies held
              independently by that employer.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              We will explain any further action needed to request deletion of those copies. We
              will also arrange deletion with service providers processing account data on
              JobLink&rsquo;s behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              Backups and retained records
            </h2>
            <p className="text-text-light leading-relaxed">
              Deleted data may remain in restricted backups until those backups expire, within 90
              days after deletion from active systems. Backup data is not used for ordinary
              service delivery.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              If specific information must be retained for a legitimate legal, security or
              fraud-prevention reason, we will explain the information retained, the reason and
              the retention period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-3">
              Before you request deletion
            </h2>
            <p className="text-text-light leading-relaxed">
              Save any information you want to keep. Once deletion is complete, your account and
              deleted data cannot be restored.
            </p>
            <p className="mt-3 text-text-light leading-relaxed">
              For questions about deletion or your privacy, contact{' '}
              <a className="text-accent underline" href="mailto:hello@joblinkantigua.com">
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
