import type { Metadata } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import "./globals.css";

const displayFont = DM_Serif_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "400",
});

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://joblinkantigua.com"),
  title: {
    default: "JobLinks — Jobs in Antigua and Barbuda",
    template: "%s | JobLinks",
  },
  description:
    "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume — free. Employers post listings and find talent instantly.",
  keywords: [
    "jobs in Antigua",
    "Antigua jobs",
    "Barbuda jobs",
    "job board Antigua",
    "find work Antigua",
    "hiring Antigua",
    "careers Antigua and Barbuda",
    "employment Antigua",
    "JobLinks",
  ],
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_AG",
    siteName: "JobLinks",
    title: "JobLinks — Jobs in Antigua and Barbuda",
    description:
      "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume — free.",
    url: "https://joblinkantigua.com",
    images: [
      {
        url: "/images/colorful-buildings.jpg",
        width: 1200,
        height: 630,
        alt: "JobLinks — Find work in Antigua",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JobLinks — Jobs in Antigua and Barbuda",
    description:
      "Antigua and Barbuda's #1 job platform. Browse jobs, apply in minutes, and build your resume — free.",
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
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased font-sans`}>
        <AuthProvider>
          <Navbar />
          <main className="min-h-screen pb-20 md:pb-0">{children}</main>
          <Footer />
          <BottomNav />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
