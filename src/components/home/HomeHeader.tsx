"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Brand from "./Brand";

export default function HomeHeader() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, userRole } = useAuth();
  const employerHref = isAuthenticated ? (userRole === "employer" ? "/post-job" : "/dashboard") : "/employer/signup";
  return <header className="home-header">
    <Brand />
    <nav className="home-desktop-links" aria-label="Main navigation">
      <Link href="/jobs">Find jobs</Link><Link href="#employers">For employers</Link><Link href="/about">About</Link>
    </nav>
    <div className="home-header-actions"><Link href={isAuthenticated ? "/dashboard" : "/login"}>{isAuthenticated ? "Dashboard" : "Sign in"}</Link><Link className="home-button" href={employerHref}>Post a job</Link></div>
    <button className="home-menu-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="home-mobile-menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    {open && <nav id="home-mobile-menu" className="home-mobile-menu" aria-label="Mobile navigation" onClick={() => setOpen(false)}><Link href="/jobs">Find jobs</Link><Link href="#employers">For employers</Link><Link href="/about">About</Link><Link href={isAuthenticated ? "/dashboard" : "/login"}>{isAuthenticated ? "Dashboard" : "Sign in"}</Link><Link href={employerHref}>Post a job</Link></nav>}
  </header>;
}
