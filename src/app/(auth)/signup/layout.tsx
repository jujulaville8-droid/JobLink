export const metadata = {
  title: "Sign Up — Create Your JobLink Account",
  description:
    "Join JobLink for free. Create your account to browse jobs, apply in minutes, and build your resume in Antigua and Barbuda.",
  // noindex like the other auth screens: ?category= / ?role= variants were
  // reported as duplicates. The canonical points every variant at the base path.
  robots: { index: false, follow: true },
  alternates: { canonical: "https://joblinkantigua.com/signup" },
  openGraph: {
    title: "Sign Up — Create Your JobLink Account",
    description:
      "Join JobLink for free. Browse jobs, apply in minutes, and build your resume in Antigua and Barbuda.",
    url: "https://joblinkantigua.com/signup",
    siteName: "JobLink",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
