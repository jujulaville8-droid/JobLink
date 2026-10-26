import type { Metadata } from "next";
import { Inter } from "next/font/google";
import PrivacyAwareAnalytics from "@/components/PrivacyAwareAnalytics";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import SupportButton from "@/components/SupportButton";
import "./globals.css";
import "@/components/home/home.css";

// One sans for the whole product. Inter is variable, so 400/500/600/700 are real
// weights rather than the synthetic bold the single-weight serif used to force.
// globals.css points --font-heading and --font-display at this same family.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://joblinkantigua.com"),
  title: {
    default: "JobLink | Jobs in Antigua and Barbuda",
    template: "%s | JobLink",
  },
  description:
    "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume for free. Employers post listings and find talent instantly.",
  keywords: [
    "jobs in Antigua",
    "Antigua jobs",
    "Barbuda jobs",
    "job board Antigua",
    "find work Antigua",
    "hiring Antigua",
    "careers Antigua and Barbuda",
    "employment Antigua",
    "JobLink",
  ],
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_AG",
    siteName: "JobLink",
    title: "JobLink | Jobs in Antigua and Barbuda",
    description:
      "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume for free.",
    url: "https://joblinkantigua.com",
    images: [
      {
        url: "/images/colorful-buildings.jpg",
        width: 1200,
        height: 630,
        alt: "Find work in Antigua with JobLink",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JobLink | Jobs in Antigua and Barbuda",
    description:
      "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume for free.",
    images: ["/images/colorful-buildings.jpg"],
  },
  alternates: {
    canonical: "https://joblinkantigua.com",
    languages: { "en-AG": "https://joblinkantigua.com" },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AG" suppressHydrationWarning>
      <head>
        <meta name="impact-site-verification" content="f3103db6-1ece-4ed4-afbb-e66b3501d3d4" />
      </head>
      <body className={`${bodyFont.variable} antialiased font-sans`}>
        <AuthProvider>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <Navbar />
          <main id="main-content" tabIndex={-1} className="min-h-screen pb-20 md:pb-0">{children}</main>
          <Footer />
          <BottomNav />
          <SupportButton />
        </AuthProvider>
        <PrivacyAwareAnalytics />
      </body>
    </html>
  );
}
