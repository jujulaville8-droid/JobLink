import type { Metadata } from "next";

// The (auth) layout already makes this screen noindex. Without its own
// canonical it inherited the homepage canonical and title.
export const metadata: Metadata = {
  title: "Employer Sign In",
  alternates: { canonical: "https://joblinkantigua.com/employer/login" },
};

export default function EmployerLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
