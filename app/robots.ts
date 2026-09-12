import type { MetadataRoute } from "next";

const DISALLOW_PRIVATE = ["/dashboard/", "/admin/", "/api/", "/invite/"];

// All major search engines and AI crawlers explicitly allowed.
// Explicit rules override Cloudflare-managed Disallow blocks at the edge.
const ALL_CRAWLERS = [
  // Search engines
  "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider",
  "YandexBot", "ia_archiver",
  // AI answer engines
  "GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot",
  "meta-externalagent", "Applebot-Extended", "Amazonbot", "YouBot",
  "cohere-ai", "Diffbot", "Timpibot", "OAI-SearchBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW_PRIVATE },
      ...ALL_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: "/",
        disallow: DISALLOW_PRIVATE,
      })),
    ],
    sitemap: "https://estimatenepal.com/sitemap.xml",
  };
}
