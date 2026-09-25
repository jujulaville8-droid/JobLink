export const metadata = {
  title: "Verify Your Email",
  // A transactional screen. It has no value in search results, and without an
  // explicit canonical it would inherit the root layout's homepage canonical.
  robots: { index: false, follow: false },
  alternates: { canonical: "https://joblinkantigua.com/verify-email" },
};

export default function VerifyEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
