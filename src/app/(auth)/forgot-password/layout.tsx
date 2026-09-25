import type { Metadata } from "next";

// The (auth) layout already makes this screen noindex. Without its own
// canonical it inherited the homepage canonical and title.
export const metadata: Metadata = {
  title: "Forgot Password",
  alternates: { canonical: "https://joblinkantigua.com/forgot-password" },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
