import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

// Public endpoint — no auth required. Returns site branding config for client-side pages.
// Values are Redis-cached for 5 minutes so this is fast.
export async function GET() {
  const [siteName, logoUrl, faviconUrl, loginHeadline, loginSubtext, registerHeadline, registerSubtext, ogTitle, ogDescription] =
    await Promise.all([
      getConfig("site_name"),
      getConfig("site_logo_url"),
      getConfig("site_favicon_url"),
      getConfig("login_headline"),
      getConfig("login_subtext"),
      getConfig("register_headline"),
      getConfig("register_subtext"),
      getConfig("og_title"),
      getConfig("og_description"),
    ]);

  return NextResponse.json(
    {
      siteName: siteName || "Estimate Nepal",
      logoUrl: logoUrl || "",
      faviconUrl: faviconUrl || "",
      loginHeadline: loginHeadline || "Nepal's Smart Construction Estimator",
      loginSubtext: loginSubtext || "Create accurate BOQs, manage tenders, and collaborate with your team — all in one place.",
      registerHeadline: registerHeadline || "Nepal's Complete Construction Marketplace",
      registerSubtext: registerSubtext || "From quantity takeoff to contractor selection — manage every phase of your construction project.",
      ogTitle: ogTitle || "Nepal's Smart Construction Platform",
      ogDescription: ogDescription || "Create accurate BOQs, manage tenders, bid on projects, and collaborate with your team.",
    },
    {
      headers: {
        // Cache on CDN for 5 min, stale-while-revalidate for another 5
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
      },
    }
  );
}
