import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { fmtNPR } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pricing — Estimate Nepal",
  description: "Simple, transparent pricing for construction estimating in Nepal. Start free, upgrade when ready.",
};

const fmt = fmtNPR;

export default async function PricingPage() {
  const [cfg, session] = await Promise.all([getAllConfigs(), getSession()]);
  const isLoggedIn = !!session?.user;

  const priceSolo  = parseInt(cfg.price_solo_monthly,  10) || 1499;
  const priceTeam3 = parseInt(cfg.price_team3_monthly, 10) || 3499;
  const priceTeam5 = parseInt(cfg.price_team5_monthly, 10) || 5499;
  const anchorSolo  = parseInt(cfg.price_solo_anchor,   10) || 2999;
  const anchorTeam3 = parseInt(cfg.price_team3_anchor,  10) || 6999;
  const anchorTeam5 = parseInt(cfg.price_team5_anchor,  10) || 10999;
  const freeMonths  = parseInt(cfg.annual_free_months,  10) || 2;
  const contactWa   = (cfg.contact_whatsapp || "").replace(/\D/g, "");
  const waMsg       = encodeURIComponent(cfg.whatsapp_message || "Hi, I am interested in an Enterprise plan for Estimate Nepal.");

  const PLANS = [
    {
      key: "free",
      name: "Free",
      price: 0,
      anchor: null as number | null,
      users: "1 user",
      storage: "1 GB",
      features: ["1 project forever", "Full takeoff & BOQ", "PDF & Excel export", "DUDBC rate catalog"],
      cta: isLoggedIn ? "Current Free Plan" : "Start Free",
      href: isLoggedIn ? "/dashboard" : "/register",
      highlight: false,
      disabled: isLoggedIn,
      badge: null as string | null,
    },
    {
      key: "solo-pro",
      name: "Solo Pro",
      price: priceSolo,
      anchor: anchorSolo,
      users: "1 user",
      storage: `${cfg.storage_limit_solo_gb || "10"} GB`,
      features: ["Unlimited projects", "Full takeoff & BOQ", "PDF / Excel / Tender export", "DUDBC rate catalog", "Priority support"],
      cta: "Pay Now",
      href: "/checkout?plan=solo-pro",
      highlight: true,
      disabled: false,
      badge: "Most Popular",
    },
    {
      key: "team-3",
      name: "Team of 3",
      price: priceTeam3,
      anchor: anchorTeam3,
      users: "Up to 3 users",
      storage: `${cfg.storage_limit_team_gb || "20"} GB`,
      features: ["Everything in Solo Pro", "3 team members", "Role-based access", "Shared project library", "Live collaboration"],
      cta: "Pay Now",
      href: "/checkout?plan=team-3",
      highlight: false,
      disabled: false,
      badge: null,
    },
    {
      key: "team-5",
      name: "Team of 5",
      price: priceTeam5,
      anchor: anchorTeam5,
      users: "Up to 5 users",
      storage: `${cfg.storage_limit_team_gb || "20"} GB`,
      features: ["Everything in Team 3", "5 team members", "Priority support", "Custom assembly library", "Advanced analytics"],
      cta: "Pay Now",
      href: "/checkout?plan=team-5",
      highlight: false,
      disabled: false,
      badge: null,
    },
    {
      key: "enterprise",
      name: "Enterprise",
      price: null as number | null,
      anchor: null as number | null,
      users: "6+ users",
      storage: "Custom",
      features: ["Custom onboarding", "Dedicated support", "Volume discounts", "Custom integrations", "SLA guarantee"],
      cta: "Contact Us",
      href: contactWa ? `https://wa.me/${contactWa}?text=${waMsg}` : "/contact",
      highlight: false,
      disabled: false,
      badge: null,
    },
    {
      key: "academic",
      name: "Academic",
      price: null as number | null,
      anchor: null as number | null,
      users: "Up to 5 users",
      storage: "10 GB",
      features: ["Everything in Team of 3", "Educational institution use", "Up to 5 students/faculty", "Priority onboarding", "Discounted rate"],
      cta: "Contact Us",
      href: contactWa
        ? `https://wa.me/${contactWa}?text=${encodeURIComponent("Hi, I represent an educational institution and am interested in the Academic plan for Estimate Nepal.")}`
        : "/contact",
      highlight: false,
      disabled: false,
      badge: "Edu",
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
                ← Dashboard
              </Link>
            ) : (
              <Link href="/" className="text-sm text-blue-600 hover:underline">
                ← Home
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/dashboard/settings?tab=billing"
                className="text-sm text-gray-600 hover:text-gray-800">
                Settings → Billing
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-gray-600 hover:text-gray-800">Log in</Link>
                <Link href="/register" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition">
                  Start Free
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-14">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-gray-500 text-base max-w-xl mx-auto">
            Start free — no credit card, no time limit. Upgrade when you are ready.
            Founding member prices are locked forever.
          </p>
          <div className="inline-flex items-center gap-2 mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-2 rounded-full">
            🔒 Founding member prices — locked for life when you subscribe now
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-5 flex flex-col relative ${
                plan.highlight
                  ? "border-blue-500 bg-blue-600 text-white shadow-xl ring-2 ring-blue-400"
                  : "border-gray-200 bg-white text-gray-900"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                  plan.highlight ? "bg-white text-blue-700" : "bg-blue-600 text-white"
                }`}>
                  {plan.badge}
                </div>
              )}

              {/* Founding member tag */}
              {!plan.disabled && plan.price !== null && plan.price > 0 && (
                <div className={`text-xs font-semibold rounded-full px-3 py-1 w-fit mb-3 ${
                  plan.highlight ? "bg-white/10 text-amber-300 border border-amber-300/30" : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  🔒 Founding Member Price
                </div>
              )}
              {(plan.disabled || plan.price === 0 || plan.price === null) && <div className="h-7 mb-0" />}

              {/* Plan name */}
              <h2 className={`font-bold text-lg mb-2 ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                {plan.name}
              </h2>

              {/* Price */}
              <div className="mb-4">
                {plan.price === 0 ? (
                  <>
                    <span className={`text-3xl font-extrabold ${plan.highlight ? "text-white" : "text-gray-900"}`}>NPR 0</span>
                    <span className={`text-sm ml-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>forever</span>
                  </>
                ) : plan.price !== null ? (
                  <>
                    {plan.anchor && (
                      <div className={`text-sm line-through mb-0.5 ${plan.highlight ? "text-blue-300" : "text-gray-400"}`}>
                        {fmt(plan.anchor)}/mo
                      </div>
                    )}
                    <span className={`text-3xl font-extrabold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                      {fmt(plan.price)}
                    </span>
                    <span className={`text-sm ml-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>/month</span>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold text-gray-900">Custom</span>
                )}
              </div>

              {/* Users + storage */}
              <p className={`text-sm mb-0.5 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>{plan.users}</p>
              <p className={`text-sm mb-4 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>{plan.storage} storage</p>

              {/* Features */}
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className={`flex-shrink-0 mt-0.5 ${plan.highlight ? "text-blue-200" : "text-green-500"}`}>✓</span>
                    <span className={plan.highlight ? "text-blue-100" : "text-gray-600"}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.disabled ? (
                <div className="block w-full py-3 rounded-xl font-bold text-sm text-center bg-gray-100 text-gray-400 border border-gray-200">
                  {plan.cta}
                </div>
              ) : (
                <a
                  href={plan.href}
                  target={plan.key === "enterprise" ? "_blank" : undefined}
                  rel={plan.key === "enterprise" ? "noopener noreferrer" : undefined}
                  className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition ${
                    plan.highlight
                      ? "bg-white text-blue-700 hover:bg-blue-50"
                      : plan.key === "enterprise"
                      ? "bg-gray-900 text-white hover:bg-gray-800"
                      : plan.key === "free"
                      ? "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta}
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Annual note */}
        <p className="text-center text-sm text-gray-400 mt-6">
          Annual billing: pay for {12 - freeMonths} months, get 12 — {freeMonths} months free.{" "}
          <Link href="/founding-member-terms" className="underline hover:text-gray-600">
            Founding member terms →
          </Link>
        </p>

        {/* How payment works */}
        <div className="mt-14 bg-white rounded-2xl border border-gray-200 p-8 max-w-2xl mx-auto">
          <h2 className="font-bold text-gray-900 text-lg mb-5 text-center">How payment works</h2>
          <ol className="space-y-4">
            {[
              { n: "1", text: "Choose a plan above and click Pay Now." },
              { n: "2", text: "Scan the QR code on the checkout page and pay via eSewa or Khalti." },
              { n: "3", text: "Enter your registered email and transaction ID, then notify us on WhatsApp." },
              { n: "4", text: "We verify your payment (usually within a few hours) and send you an activation code." },
              { n: "5", text: "Go to Dashboard → Settings → Billing, enter the code, and your plan activates instantly." },
            ].map(step => (
              <li key={step.n} className="flex items-start gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  {step.n}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Already paid?{" "}
              <Link href={isLoggedIn ? "/dashboard/settings?tab=billing" : "/login"} className="text-blue-600 hover:underline">
                Enter your activation code →
              </Link>
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-10 max-w-2xl mx-auto space-y-3">
          {[
            { q: "Can I cancel anytime?", a: "Yes. Since billing is manual (no auto-renewal), there is nothing to cancel. Your plan simply does not renew unless you pay again." },
            { q: "What happens when my plan expires?", a: "Your data, drawings, and projects are preserved. You lose the ability to create new exports and upload drawings until you renew. You can reactivate at any time." },
            { q: "Is there a free trial?", a: "New accounts get a 14-day full-access trial. No credit card required. After the trial, you can continue on the Free plan (1 project) or upgrade." },
            { q: "Can I upgrade my plan later?", a: "Yes. Contact us on WhatsApp with your new plan choice and we will issue a new activation code for the upgraded plan." },
          ].map(({ q, a }) => (
            <details key={q} className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none">
                <span className="font-semibold text-sm text-gray-800">{q}</span>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
