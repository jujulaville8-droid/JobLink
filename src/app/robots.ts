import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/profile",
          "/messages",
          "/applications",
          "/saved",
          "/settings",
          "/admin",
          "/post-job",
          "/my-listings",
          "/browse-candidates",
          "/candidates",
          "/company-profile",
          "/employers/upgrade",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: "https://joblinkantigua.com/sitemap.xml",
  };
}
