import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/admin/", "/api/", "/invite/"],
      },
    ],
    sitemap: "https://estimatenepal.com/sitemap.xml",
  };
}
