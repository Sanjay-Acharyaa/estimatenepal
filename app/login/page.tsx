import type { Metadata } from "next";
import { Suspense } from "react";
import { getConfig } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In — Estimate Nepal",
  description: "Sign in to your Estimate Nepal account to manage construction projects, BOQs, and tenders.",
  alternates: { canonical: "https://estimatenepal.com/login" },
  robots: { index: false },
};

// Server component — fetches branding from config (Redis-cached, ~1ms) so the
// correct logo/headline loads on first render with no client-side flash.
export default async function LoginPage() {
  const [siteName, logoUrl, headline, subtext] = await Promise.all([
    getConfig("site_name"),
    getConfig("site_logo_url"),
    getConfig("login_headline"),
    getConfig("login_subtext"),
  ]);

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm
        siteName={siteName || "Estimate Nepal"}
        logoUrl={logoUrl || ""}
        headline={headline || "Nepal's Smart Construction Estimator"}
        subtext={subtext || "Create accurate BOQs, manage tenders, and collaborate with your team — all in one place."}
      />
    </Suspense>
  );
}
