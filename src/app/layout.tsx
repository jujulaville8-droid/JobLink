import type { Metadata } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
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
  title: "JobLink — Antigua's Job Platform",
  description:
    "The first dedicated job platform for Antigua and Barbuda. Find jobs, post listings, and connect with employers.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "1024x1024" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased font-sans`}>
        <AuthProvider>
          <Navbar />
          <main className="min-h-screen pb-20 md:pb-0">{children}</main>
          <Footer />
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
