import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Create Account — Estimate Nepal",
  description: "Start your free 14-day trial. Create BOQs with DUDBC rates, measure PDF drawings, and manage tenders — no credit card required.",
  alternates: { canonical: "https://estimatenepal.com/register" },
  keywords: ["construction software Nepal free trial", "BOQ software Nepal", "DUDBC rate software"],
  openGraph: {
    title: "Create Your Free Account — Estimate Nepal",
    description: "Start your free 14-day trial. BOQ creation, PDF takeoff, DUDBC rates — no credit card required.",
    url: "https://estimatenepal.com/register",
  },
  twitter: {
    title: "Create Your Free Account — Estimate Nepal",
    description: "Start your free 14-day trial. BOQ creation, PDF takeoff, DUDBC rates — no credit card required.",
  },
};

export default async function RegisterPage() {
  const [siteName, logoUrl, headline, subtext] = await Promise.all([
    getConfig("site_name"),
    getConfig("site_logo_url"),
    getConfig("register_headline"),
    getConfig("register_subtext"),
  ]);

  return (
    <RegisterForm
      siteName={siteName || "Estimate Nepal"}
      logoUrl={logoUrl || ""}
      headline={headline || "Nepal's Complete Construction Marketplace"}
      subtext={subtext || "From quantity takeoff to contractor selection — manage every phase of your construction project."}
    />
  );
}
