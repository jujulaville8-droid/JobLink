export const metadata = {
  title: "Post a Job — Employer Sign Up",
  description:
    "Create a free JobLinks employer account. Post a job, reach candidates across Antigua and Barbuda, and hire faster.",
  // noindex like the other auth screens: ?category= / ?role= variants were
  // reported as duplicates. The canonical points every variant at the base path.
  robots: { index: false, follow: true },
  alternates: { canonical: "https://joblinkantigua.com/employer/signup" },
  openGraph: {
    title: "Post a Job — Employer Sign Up | JobLinks",
    description:
      "Create a free JobLinks employer account and reach candidates across Antigua and Barbuda.",
    url: "https://joblinkantigua.com/employer/signup",
    siteName: "JobLinks",
  },
};

export default function EmployerSignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
