import type { MetadataRoute } from "next";

const DISALLOW_PRIVATE = ["/dashboard/", "/admin/", "/api/", "/invite/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Wildcard — covers all crawlers including Googlebot, Bingbot, etc.
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_PRIVATE,
      },
      // Explicit allow for AI answer crawlers — overrides Cloudflare-managed Disallow
      // rules that Cloudflare prepends to this file at the edge.
      { userAgent: "GPTBot",            allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "ClaudeBot",         allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "Google-Extended",   allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "PerplexityBot",     allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "meta-externalagent",allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "Applebot-Extended", allow: "/", disallow: DISALLOW_PRIVATE },
      { userAgent: "Amazonbot",         allow: "/", disallow: DISALLOW_PRIVATE },
    ],
    sitemap: "https://estimatenepal.com/sitemap.xml",
  };
}
