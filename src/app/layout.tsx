import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobLink — Antigua's Job Platform",
  description:
    "The first dedicated job platform for Antigua and Barbuda. Find jobs, post listings, and connect with employers.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRole: "seeker" | "employer" | "admin" | null = null;

  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    userRole =
      (userData?.role as typeof userRole) ??
      (user.user_metadata?.role as typeof userRole) ??
      "seeker";
  }

  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans`}>
        <AuthProvider initialUser={user} initialRole={userRole}>
          <Navbar />
          <main className="min-h-screen pb-20 md:pb-0">{children}</main>
          <Footer />
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
