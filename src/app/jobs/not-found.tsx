import type { Metadata } from "next";

export { default } from "../not-found";

// Next resolves not-found metadata separately from the page's generateMetadata.
// Explicitly clear the root layout's homepage canonical on missing jobs pages.
export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};
