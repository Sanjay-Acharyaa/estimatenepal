import type { MetadataRoute } from "next";

const BASE = "https://estimatenepal.com";
const now = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core marketing ────────────────────────────────────────────────────
    { url: BASE,                                lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/pricing`,                   lastModified: now, changeFrequency: "monthly", priority: 0.95 },
    { url: `${BASE}/about`,                     lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE}/faq`,                       lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE}/contact`,                   lastModified: now, changeFrequency: "monthly", priority: 0.80 },
    { url: `${BASE}/help`,                      lastModified: now, changeFrequency: "monthly", priority: 0.75 },

    // ── Auth ──────────────────────────────────────────────────────────────
    { url: `${BASE}/register`,                  lastModified: now, changeFrequency: "monthly", priority: 0.80 },
    { url: `${BASE}/login`,                     lastModified: now, changeFrequency: "monthly", priority: 0.60 },

    // ── Legal / trust ─────────────────────────────────────────────────────
    { url: `${BASE}/terms`,                     lastModified: now, changeFrequency: "yearly",  priority: 0.50 },
    { url: `${BASE}/privacy`,                   lastModified: now, changeFrequency: "yearly",  priority: 0.50 },
    { url: `${BASE}/security`,                  lastModified: now, changeFrequency: "yearly",  priority: 0.50 },
    { url: `${BASE}/refund`,                    lastModified: now, changeFrequency: "yearly",  priority: 0.40 },
    { url: `${BASE}/founding-member-terms`,     lastModified: now, changeFrequency: "yearly",  priority: 0.30 },
  ];
}
