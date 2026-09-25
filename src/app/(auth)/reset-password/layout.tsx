import type { Metadata } from "next";

// The (auth) layout already makes this screen noindex. Without its own
// canonical it inherited the homepage canonical and title.
export const metadata: Metadata = {
  title: "Reset Password",
  alternates: { canonical: "https://joblinkantigua.com/reset-password" },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
