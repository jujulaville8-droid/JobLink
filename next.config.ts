import type { NextConfig } from "next";

// Explicitly scoped to the isolated HTTP test stack; production keeps HTTPS.
const localE2E = process.env.NODE_ENV === "development"
  && process.env.JOBLINK_LOCAL_E2E === "true"
  && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321";

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
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://va.vercel-scripts.com${localE2E ? " http://127.0.0.1:54321 ws://127.0.0.1:54321 ws://127.0.0.1:4300" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://calendly.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(localE2E ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // PDF text extraction imports the exact-pinned parser in a Node worker. Keep
  // those runtime modules available in Vercel's traced server function bundle.
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/package.json"],
  },
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
      ...["/claim/:path*", "/api/claim/:path*", "/api/admin/company-claims", "/signup", "/login", "/employer/:path*", "/verify-email", "/auth/:path*"].map(source => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
};

export default nextConfig;
