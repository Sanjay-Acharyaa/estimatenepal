import { getConfig } from "@/lib/config";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const [siteName, logoUrl, headline, subtext] = await Promise.all([
    getConfig("site_name"),
    getConfig("site_logo_url"),
    getConfig("register_headline"),
    getConfig("register_subtext"),
  ]);

  return (
    <RegisterForm
      siteName={siteName || "NepaliEstimate"}
      logoUrl={logoUrl || ""}
      headline={headline || "Nepal's Complete Construction Marketplace"}
      subtext={subtext || "From quantity takeoff to contractor selection — manage every phase of your construction project."}
    />
  );
}
