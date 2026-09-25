import type { Metadata } from "next";

// The (auth) layout already makes this screen noindex. Without its own
// canonical it inherited the homepage canonical and title.
export const metadata: Metadata = {
  title: "Sign In",
  alternates: { canonical: "https://joblinkantigua.com/login" },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
