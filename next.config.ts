import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` is required for styles because Tailwind and the component
 * library emit inline style attributes, and for scripts because Next's
 * bootstrap and the inline JSON-LD blocks are not nonced in this setup. The
 * policy is still worth having: it constrains where scripts, frames, images
 * and form posts may come from, which is what blocks the common injection and
 * clickjacking routes.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Stripe Checkout, Vercel Analytics.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Company logos and avatars are user-supplied remote URLs.
  "img-src 'self' data: blob: https:",
  // Supabase REST, auth, storage and realtime; Stripe; Vercel Analytics.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://va.vercel-scripts.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://calendly.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hfcfuvbyqxkvnenfykex.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/company-logos/**",
        search: "",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
