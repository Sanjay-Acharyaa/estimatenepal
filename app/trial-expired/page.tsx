import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { CouponForm } from "@/components/trial/CouponForm";

export default async function TrialExpiredPage() {
  const cfg = await getAllConfigs();

  const trialDays = parseInt(cfg.trial_days, 10) || 14;
  const priceSolo = parseInt(cfg.price_solo_monthly, 10) || 999;
  const priceTeam3 = parseInt(cfg.price_team3_monthly, 10) || 1999;
  const priceTeam5 = parseInt(cfg.price_team5_monthly, 10) || 3000;
  const freeMonths = parseInt(cfg.annual_free_months, 10) || 2;
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const contactWa = cfg.contact_whatsapp || "+977XXXXXXXXX";
  const waMsg = encodeURIComponent(cfg.whatsapp_message || "Hi, I am interested in Estimate Nepal. Please share pricing details.");
  const waHref = `https://wa.me/${contactWa.replace(/\D/g, "")}?text=${waMsg}`;

  const fmt = (n: number) => `NPR ${n.toLocaleString("en-NP")}`;

  const PLANS = [
    { name: "Solo", price: priceSolo, users: "1 user", highlight: false },
    { name: "Team of 3", price: priceTeam3, users: "Up to 3 users", highlight: true },
    { name: "Team of 5", price: priceTeam5, users: "Up to 5 users", highlight: false },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Your {trialDays}-Day Free Trial Has Ended</h1>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Choose a plan below to continue accessing Estimate Nepal and all your project data.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-5 text-center ${
                plan.highlight
                  ? "border-blue-500 bg-blue-600 text-white shadow-lg"
                  : "border-gray-200 bg-white"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-bold text-blue-100 bg-blue-500/40 rounded-full px-2 py-0.5 w-fit mx-auto mb-2">
                  Popular
                </div>
              )}
              <h3 className={`font-bold text-base mb-1 ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-2 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>{plan.users}</p>
              <p className={`text-2xl font-extrabold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                {fmt(plan.price)}
              </p>
              <p className={`text-xs ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>/month</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mb-6">
          Annual billing: {freeMonths} months free. Enterprise (6+ users): contact us for custom pricing.
        </p>

        {/* Contact CTAs */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-4">
          <h2 className="font-semibold text-gray-800 mb-4 text-center">Get access now</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl text-sm font-semibold transition"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.547 4.089 1.504 5.815L0 24l6.335-1.48A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.584-.505-5.078-1.384l-.363-.215-3.762.879.933-3.667-.236-.378A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              WhatsApp Us
            </a>
            <a
              href={`mailto:${contactEmail}?subject=Estimate Nepal%20Upgrade&body=Hi%2C%20my%20trial%20has%20ended%20and%20I%20would%20like%20to%20subscribe.`}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              Email Us
            </a>
          </div>
        </div>

        {/* Coupon form — client component */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
          <CouponForm />
        </div>

        <div className="text-center">
          <Link href="/login" className="text-sm text-gray-400 hover:text-gray-600 transition">
            Sign in with a different account
          </Link>
        </div>
      </div>
    </div>
  );
}
