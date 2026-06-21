import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getAllConfigs } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Estimate Nepal — Construction Estimating Software for Nepal",
  description:
    "Generate BOQ, analyse DUDBC rates, export tender documents, and measure directly on PDF drawings. Built for Nepali construction professionals.",
  openGraph: {
    title: "Estimate Nepal — Construction Estimating Software",
    description:
      "The fastest way to estimate construction costs in Nepal. DUDBC rates, BOQ, drawings — all in one platform.",
    url: "https://estimatenepal.com",
    siteName: "Estimate Nepal",
    type: "website",
  },
  keywords: [
    "construction estimating Nepal",
    "DUDBC rates",
    "BOQ software Nepal",
    "tender document Nepal",
    "quantity takeoff Nepal",
    "Estimate Nepal",
  ],
  alternates: { canonical: "https://estimatenepal.com" },
};

const FEATURES = [
  {
    icon: "📋",
    title: "Automated BOQ Generation",
    desc: "Connect DUDBC rates to your takeoff measurements and generate a complete Bill of Quantities in seconds — no manual calculation.",
  },
  {
    icon: "📐",
    title: "Drawing Takeoff",
    desc: "Measure lengths, areas, volumes, and counts directly on PDF drawings. Set scale once and measure everything digitally.",
  },
  {
    icon: "📊",
    title: "DUDBC Rate Analysis",
    desc: "Full cost breakdown with labour, material, and equipment — aligned with official DUDBC fiscal-year rates for all 77 districts.",
  },
  {
    icon: "📄",
    title: "PDF & Excel Export",
    desc: "Export professional tender documents, MB books, and rate analysis sheets ready for client submission in one click.",
  },
  {
    icon: "👥",
    title: "Team Collaboration",
    desc: "Invite estimators and engineers, assign roles, and manage permissions. The whole team works in the same live project.",
  },
  {
    icon: "📌",
    title: "Project Dashboard",
    desc: "Track all bids and projects in one place. Monitor status, deadlines, priorities, and bid values at a glance.",
  },
];

const STEPS = [
  { n: "1", title: "Upload Your Drawings", desc: "Upload project PDFs. Each page is processed for digital measurement." },
  { n: "2", title: "Measure & Apply Rates", desc: "Trace measurements on drawings and link them to DUDBC or your custom rates." },
  { n: "3", title: "Export & Win Bids", desc: "Generate BOQ, rate analysis, and tender documents in one click." },
];

function fmt(n: number) {
  return `NPR ${n.toLocaleString("en-NP")}`;
}

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const [cfg, testimonials] = await Promise.all([
    getAllConfigs(),
    prisma.testimonial.findMany({
      where: { isApproved: true },
      orderBy: { submittedAt: "desc" },
      take: 6,
      select: { id: true, authorName: true, authorRole: true, company: true, content: true, rating: true },
    }),
  ]);

  // Compute aggregate rating — only include if we have at least 3 reviews
  const ratingCount = testimonials.length;
  const ratingValue =
    ratingCount >= 3
      ? Math.round((testimonials.reduce((sum, t) => sum + t.rating, 0) / ratingCount) * 10) / 10
      : null;

  const trialDays = parseInt(cfg.trial_days, 10) || 14;
  const priceSolo = parseInt(cfg.price_solo_monthly, 10) || 999;
  const priceTeam3 = parseInt(cfg.price_team3_monthly, 10) || 1999;
  const priceTeam5 = parseInt(cfg.price_team5_monthly, 10) || 3000;
  const pricePerSeat = parseInt(cfg.price_per_seat_enterprise, 10) || 550;
  const freeMonths = parseInt(cfg.annual_free_months, 10) || 2;
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const contactWa = cfg.contact_whatsapp || "+977XXXXXXXXX";
  const waMsg = encodeURIComponent(cfg.whatsapp_message || "Hi, I am interested in Estimate Nepal. Please share pricing details.");

  const PLANS = [
    {
      name: "Solo",
      price: priceSolo,
      users: "1 user",
      storage: `${cfg.storage_limit_solo_gb || "10"} GB storage`,
      features: ["All core features", "DUDBC rate catalog", "PDF & Excel export", "Drawing takeoff"],
      cta: "Start Free Trial",
      href: "/register",
      highlight: false,
    },
    {
      name: "Team of 3",
      price: priceTeam3,
      users: "Up to 3 users",
      storage: `${cfg.storage_limit_team_gb || "20"} GB storage`,
      features: ["Everything in Solo", "3 team members", "Role-based access", "Shared project library"],
      cta: "Start Free Trial",
      href: "/register",
      highlight: true,
    },
    {
      name: "Team of 5",
      price: priceTeam5,
      users: "Up to 5 users",
      storage: `${cfg.storage_limit_team_gb || "20"} GB storage`,
      features: ["Everything in Team 3", "5 team members", "Priority support", "Custom assembly library"],
      cta: "Start Free Trial",
      href: "/register",
      highlight: false,
    },
    {
      name: "Enterprise",
      price: null,
      users: "6+ users",
      storage: "Custom storage",
      features: [`From ${fmt(pricePerSeat)}/seat`, "Custom onboarding", "Dedicated support", "Volume discounts"],
      cta: "Contact Us",
      href: `https://wa.me/${contactWa.replace(/\D/g, "")}?text=${waMsg}`,
      highlight: false,
    },
  ];

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Estimate Nepal?",
        acceptedAnswer: { "@type": "Answer", text: "Estimate Nepal is a web-based construction cost estimating software built for Nepal. It helps engineers, quantity surveyors, and contractors generate BOQ using official DUDBC rates, measure PDF drawings, and export professional tender documents." },
      },
      {
        "@type": "Question",
        name: "What are DUDBC rates?",
        acceptedAnswer: { "@type": "Answer", text: "DUDBC rates are official construction cost rates published by Nepal's Department of Urban Development and Building Construction (DUDBC). They cover labour, material, and equipment costs for all construction activities across all 77 districts of Nepal and are updated each fiscal year." },
      },
      {
        "@type": "Question",
        name: "How do I create a BOQ in Nepal?",
        acceptedAnswer: { "@type": "Answer", text: "With Estimate Nepal, you can create a BOQ by uploading your PDF drawings, measuring quantities directly on the drawings, and connecting those measurements to DUDBC rate items. The software automatically calculates costs and generates a professional BOQ ready for tender submission." },
      },
      {
        "@type": "Question",
        name: "Is Estimate Nepal free to use?",
        acceptedAnswer: { "@type": "Answer", text: `Estimate Nepal offers a ${trialDays}-day free trial with no credit card required. After the trial, plans start from NPR ${priceSolo} per month for a single user.` },
      },
      {
        "@type": "Question",
        name: "Can I export tender documents from Estimate Nepal?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Estimate Nepal lets you export professional tender documents, Bill of Quantities, rate analysis sheets, and measurement books (MB) as PDF or Excel files, ready for client or government submission." },
      },
      {
        "@type": "Question",
        name: "Does Estimate Nepal support all 77 districts of Nepal?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. The DUDBC rate catalog in Estimate Nepal covers all 77 districts of Nepal with district-specific rates for labour, materials, and equipment as per the latest DUDBC fiscal year schedule." },
      },
    ],
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to create a construction BOQ using DUDBC rates in Nepal",
    description: "Step-by-step guide to generating a Bill of Quantities for Nepal construction projects using official DUDBC rates.",
    step: [
      { "@type": "HowToStep", name: "Create a project", text: "Sign up on Estimate Nepal and create a new construction project with project name, location, and district." },
      { "@type": "HowToStep", name: "Upload PDF drawings", text: "Upload your architectural or structural PDF drawings. Set the scale by measuring a known dimension on the drawing." },
      { "@type": "HowToStep", name: "Take off quantities", text: "Use the drawing tools to measure lengths, areas, volumes, and counts directly on the PDF drawings." },
      { "@type": "HowToStep", name: "Link DUDBC rates", text: "Connect each measurement to the relevant DUDBC rate item from the catalog. The software automatically calculates the cost breakdown." },
      { "@type": "HowToStep", name: "Export tender documents", text: "Export the completed BOQ, rate analysis, and tender documents as PDF or Excel files ready for submission." },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://estimatenepal.com/#org",
        name: "Estimate Nepal",
        url: "https://estimatenepal.com",
        logo: "https://estimatenepal.com/icon.svg",
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: contactEmail },
        sameAs: ["https://www.facebook.com/estimatenepal"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://estimatenepal.com/#app",
        name: "Estimate Nepal",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://estimatenepal.com",
        description: "Nepal's construction estimating platform. Generate BOQ with DUDBC rates, measure PDF drawings, manage tenders, and collaborate with your team.",
        publisher: { "@id": "https://estimatenepal.com/#org" },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "NPR",
          description: `${trialDays}-day free trial, then from NPR ${priceSolo}/month`,
        },
        featureList: [
          "Automated BOQ generation with DUDBC rates",
          "PDF drawing takeoff and measurement",
          "Tender document export (PDF & Excel)",
          "Team collaboration and role management",
          "All 77 districts DUDBC rate catalog",
        ],
        // Only emit aggregateRating when we have ≥3 approved testimonials with ratings
        ...(ratingValue !== null && {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingValue.toFixed(1),
            ratingCount,
            bestRating: "5",
            worstRating: "1",
          },
        }),
      },
      {
        "@type": "WebSite",
        "@id": "https://estimatenepal.com/#website",
        url: "https://estimatenepal.com",
        name: "Estimate Nepal",
        publisher: { "@id": "https://estimatenepal.com/#org" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://estimatenepal.com/dashboard/rates?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }} />
    <div className="min-h-screen bg-white font-sans">
      {/* ── Site announcement banner (empty = hidden) ── */}
      {cfg.site_announcement && (
        <div className="bg-blue-600 text-white text-center py-2 px-4 text-sm font-medium">
          {cfg.site_announcement}
        </div>
      )}

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/">
            <Logo size={32} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
          </Link>
          <nav className="flex items-center gap-3">
            <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">
              Pricing
            </a>
            <Link href="/faq" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">
              FAQ
            </Link>
            <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">
              About
            </Link>
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
            >
              Start Free Trial
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800 text-white py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-700/50 border border-blue-600 rounded-full px-4 py-1.5 text-sm text-blue-200 mb-8">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            {trialDays}-Day Free Trial — No Credit Card Required
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            Nepal&apos;s Fastest<br />
            <span className="text-amber-400">Construction Estimating</span><br />
            Software
          </h1>
          <p className="text-blue-200 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            Generate BOQ from DUDBC rates, measure directly on drawings, and export
            tender documents — all in one platform built for Nepali engineers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-xl font-bold text-lg shadow-lg transition"
            >
              Start {trialDays}-Day Free Trial →
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 border border-blue-500 text-blue-100 rounded-xl font-semibold text-lg hover:bg-blue-800 transition"
            >
              Sign In
            </Link>
          </div>

          {/* Mock dashboard preview */}
          <div className="mt-16 mx-auto max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-blue-700/30 text-left">
            <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 bg-gray-700 rounded-md mx-4 h-6 flex items-center px-3">
                <span className="text-xs text-gray-400">estimatenepal.com/dashboard</span>
              </div>
            </div>
            <div className="flex h-64 sm:h-80">
              <div className="w-44 bg-blue-900 p-3 space-y-1 shrink-0">
                <div className="text-xs text-blue-400 uppercase tracking-wider px-3 py-1 mb-2">Estimate Nepal</div>
                {["Dashboard", "Projects", "Rates", "Assemblies", "Team"].map((item, i) => (
                  <div key={item} className={`px-3 py-2 rounded-lg text-xs font-medium ${i === 1 ? "bg-blue-600 text-white" : "text-blue-300 hover:bg-blue-800"}`}>
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Active Projects", value: "12", bg: "bg-blue-50", text: "text-blue-700" },
                    { label: "Pending Bids", value: "4", bg: "bg-amber-50", text: "text-amber-700" },
                    { label: "Completed", value: "8", bg: "bg-green-50", text: "text-green-700" },
                  ].map((s) => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3`}>
                      <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                      <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-4 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span>Project</span><span>Status</span><span>Value</span><span>Bid Due</span>
                  </div>
                  {[
                    { name: "School Building, Lalitpur", val: "NPR 24.5M", due: "2026-08-15" },
                    { name: "Road Upgrade, Pokhara", val: "NPR 38.2M", due: "2026-09-01" },
                    { name: "Bridge, Chitwan", val: "NPR 55.0M", due: "2026-09-20" },
                  ].map((p, i) => (
                    <div key={i} className="grid grid-cols-4 px-3 py-2.5 border-b border-gray-50 text-xs text-gray-700 items-center">
                      <span className="font-medium truncate">{p.name}</span>
                      <span><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Active</span></span>
                      <span className="text-gray-600">{p.val}</span>
                      <span className="text-gray-400">{p.due}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Everything you need to win more bids
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Purpose-built for Nepal&apos;s construction industry — DUDBC rates, district
              pricing, and local workflows built in.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 hover:border-blue-200 hover:bg-blue-50/30 transition">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              From drawing to tender in 3 steps
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-extrabold mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-gray-500 text-base max-w-lg mx-auto">
              Start with a {trialDays}-day free trial. No credit card required.
              Annual billing saves you {freeMonths} months free.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? "border-blue-500 bg-blue-600 text-white shadow-xl ring-2 ring-blue-500"
                    : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs font-bold text-blue-100 bg-blue-500/40 rounded-full px-3 py-1 w-fit mb-3">
                    Most Popular
                  </div>
                )}
                <h3 className={`font-bold text-lg mb-1 ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                  {plan.name}
                </h3>
                <div className="mb-4">
                  {plan.price !== null ? (
                    <>
                      <span className={`text-3xl font-extrabold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                        {fmt(plan.price)}
                      </span>
                      <span className={`text-sm ml-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>/month</span>
                    </>
                  ) : (
                    <span className="text-2xl font-extrabold text-gray-900">Custom</span>
                  )}
                </div>
                <p className={`text-sm mb-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>{plan.users}</p>
                <p className={`text-sm mb-5 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>{plan.storage}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span className={plan.highlight ? "text-blue-200" : "text-green-500"}>✓</span>
                      <span className={plan.highlight ? "text-blue-100" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition ${
                    plan.highlight
                      ? "bg-white text-blue-700 hover:bg-blue-50"
                      : plan.name === "Enterprise"
                      ? "bg-gray-900 text-white hover:bg-gray-800"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-400 mt-6">
            Annual billing: pay for {12 - freeMonths} months, get 12. Contact us for volume pricing.
          </p>
        </div>
      </section>

      {/* ── Testimonials ── */}
      {testimonials.length > 0 && (
        <section className="py-20 px-4 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
                What engineers say
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div key={t.id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                  <div className="text-amber-400 text-sm mb-3">{"★".repeat(t.rating)}</div>
                  <p className="text-gray-700 text-sm leading-relaxed mb-4">&ldquo;{t.content}&rdquo;</p>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.authorName}</p>
                    {(t.authorRole || t.company) && (
                      <p className="text-xs text-gray-500">
                        {[t.authorRole, t.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-10 text-center text-white shadow-xl">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-3xl font-extrabold mb-3">Start your free trial today</h2>
            <p className="text-blue-200 text-base mb-8 max-w-md mx-auto">
              {trialDays} days of full access — no credit card, no commitment. See how much
              faster your team can estimate.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-block px-10 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-xl font-bold text-lg shadow-lg transition"
              >
                Create Your Free Account →
              </Link>
              <a
                href={`https://wa.me/${contactWa.replace(/\D/g, "")}?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-8 py-4 bg-green-500 hover:bg-green-400 text-white rounded-xl font-bold text-lg shadow transition"
              >
                WhatsApp Us
              </a>
            </div>
            <p className="text-blue-300 text-sm mt-6">
              Questions?{" "}
              <a href={`mailto:${contactEmail}`} className="underline text-blue-100 hover:text-white">
                {contactEmail}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-3 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <Logo size={22} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
            <a href={`mailto:${contactEmail}`} className="hover:text-gray-900 transition">{contactEmail}</a>
            <Link href="/faq" className="hover:text-gray-900 transition">FAQ</Link>
            <Link href="/about" className="hover:text-gray-900 transition">About</Link>
            <Link href="/login" className="hover:text-gray-900 transition">Sign In</Link>
            <Link href="/register" className="hover:text-gray-900 transition">Register</Link>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Estimate Nepal</p>
        </div>
      </footer>
    </div>
    </>
  );
}
