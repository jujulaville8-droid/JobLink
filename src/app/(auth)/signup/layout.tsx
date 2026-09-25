export const metadata = {
  title: "Sign Up — Create Your JobLinks Account",
  description:
    "Join JobLinks for free. Create your account to browse jobs, apply in minutes, and build your resume in Antigua and Barbuda.",
  // Opt back in: the (auth) layout marks these screens noindex by default.
  robots: { index: true, follow: true },
  alternates: { canonical: "https://joblinkantigua.com/signup" },
  openGraph: {
    title: "Sign Up — Create Your JobLinks Account",
    description:
      "Join JobLinks for free. Browse jobs, apply in minutes, and build your resume in Antigua and Barbuda.",
    url: "https://joblinkantigua.com/signup",
    siteName: "JobLinks",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
