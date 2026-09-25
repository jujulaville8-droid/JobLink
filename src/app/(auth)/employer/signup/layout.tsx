export const metadata = {
  title: "Post a Job — Employer Sign Up",
  description:
    "Create a free JobLinks employer account. Post a job, reach candidates across Antigua and Barbuda, and hire faster.",
  // Opt back in: the (auth) layout marks these screens noindex by default.
  robots: { index: true, follow: true },
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
