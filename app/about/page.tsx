import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { getAllConfigs } from "@/lib/config";

export const metadata: Metadata = {
  title: "About Us | Estimate Nepal",
  description:
    "Learn about Estimate Nepal — our mission to digitise construction estimating in Nepal, who we serve, and how we help engineers, quantity surveyors, and contractors work faster.",
  keywords: [
    "about Estimate Nepal",
    "Nepal construction software company",
    "DUDBC BOQ platform Nepal",
    "construction estimating Nepal mission",
    "quantity surveying software Nepal",
  ],
  alternates: { canonical: "https://estimatenepal.com/about" },
  openGraph: {
    title: "About Us | Estimate Nepal",
    description:
      "Our mission is to digitise construction estimating in Nepal — replacing error-prone Excel BOQs with an accurate, fast, collaborative platform built for Nepali engineers.",
    url: "https://estimatenepal.com/about",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const VALUES = [
  {
    icon: "🎯",
    title: "Accuracy",
    desc: "Every calculation ties back to official DUDBC rates or your verified custom rates. No guesswork, no manual errors.",
  },
  {
    icon: "🔍",
    title: "Transparency",
    desc: "Full rate analysis breakdowns — material, labour, equipment — so you can justify every line of your BOQ to a client or auditor.",
  },
  {
    icon: "⚡",
    title: "Speed",
    desc: "Reduce BOQ preparation time from days to hours. Measure on drawings, link rates, export — a complete tender document without repetitive Excel work.",
  },
  {
    icon: "🤝",
    title: "Built for Nepal",
    desc: "All 77 districts, DUDBC fiscal-year schedules, Nepali construction workflows. Not a generic tool adapted for Nepal — built from the ground up for it.",
  },
];

const WHO_FOR = [
  { role: "Civil Engineers", desc: "Prepare accurate structural and civil BOQs with DUDBC rates and digital drawing takeoffs." },
  { role: "Quantity Surveyors (QS)", desc: "Streamline tender preparation — measurement, rate analysis, BOQ, and export in one workflow." },
  { role: "Contractors & Builders", desc: "Bid more accurately and win more tenders with professional, government-ready tender documents." },
  { role: "Architects", desc: "Generate preliminary cost estimates from drawings early in the design phase to keep projects on budget." },
  { role: "Project Managers", desc: "Track multiple bids and live project values from a single dashboard with team collaboration built in." },
];

export default async function AboutPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const contactWa = cfg.contact_whatsapp || "+977XXXXXXXXX";
  const waMsg = encodeURIComponent(
    cfg.whatsapp_message || "Hi, I am interested in Estimate Nepal. Please share pricing details."
  );

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://estimatenepal.com/#org",
    name: "Estimate Nepal",
    url: "https://estimatenepal.com",
    logo: "https://estimatenepal.com/icon.svg",
    description:
      "Estimate Nepal is Nepal's smart construction estimating platform — providing BOQ generation with DUDBC rates, PDF drawing takeoff, tender document export, and team collaboration for construction professionals.",
    foundingLocation: {
      "@type": "Place",
      addressCountry: "NP",
      addressLocality: "Kathmandu",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: contactEmail,
        availableLanguage: ["en", "ne"],
      },
    ],
    sameAs: ["https://www.facebook.com/estimatenepal"],
    areaServed: {
      "@type": "Country",
      name: "Nepal",
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
      { "@type": "ListItem", position: 2, name: "About", item: "https://estimatenepal.com/about" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="min-h-screen bg-white font-sans">
        {/* ── Nav ── */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
            <Link href="/">
              <Logo size={32} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
            </Link>
            <nav className="flex items-center gap-3">
              <Link href="/faq" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">
                FAQ
              </Link>
              <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium">
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
        <section className="bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800 text-white py-14 sm:py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <nav className="text-sm text-blue-300 mb-6" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-white transition">Home</Link>
              <span className="mx-2 text-blue-500">/</span>
              <span className="text-blue-100">About</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-4 tracking-tight">
              About Estimate Nepal
            </h1>
            <p className="text-blue-200 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              We are building Nepal&apos;s first purpose-built construction estimating platform — so engineers can spend less time in Excel and more time winning bids.
            </p>
          </div>
        </section>

        {/* ── Mission ── */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-6">Our Mission</h2>
            <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-4">
              Our mission is to <strong className="text-gray-900">digitise construction estimating in Nepal</strong> — replacing error-prone manual processes with an accurate, collaborative, and fast platform built specifically for how construction professionals in Nepal work.
            </p>
            <p className="text-gray-600 text-base leading-relaxed">
              We believe every engineer and contractor in Nepal deserves the same tools that large firms in other countries have had for years — without the complexity or the price tag. Estimate Nepal makes professional-grade BOQ and tender preparation accessible to every practitioner, from a solo consultant to a large contractor.
            </p>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-6">The Problem We Solve</h2>
            <p className="text-gray-600 text-base leading-relaxed mb-4">
              Today, most construction BOQs in Nepal are prepared manually in Microsoft Excel — a process that is slow, prone to formula errors, and nearly impossible to collaborate on in real time. Engineers spend hours copying rate tables from DUDBC schedules, calculating quantities by hand, and formatting documents for submission.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mt-8">
              {[
                { label: "Manual Excel BOQs", issue: "Formula errors, version conflicts, no audit trail" },
                { label: "DUDBC Rate Lookups", issue: "Time-consuming cross-referencing across district schedules" },
                { label: "Drawing Measurement", issue: "Manual scaling with rulers, error-prone quantity extraction" },
                { label: "Tender Documents", issue: "Hours of formatting for each submission, no reusable templates" },
              ].map((p) => (
                <div key={p.label} className="bg-white border border-gray-100 rounded-xl p-5">
                  <p className="font-bold text-gray-900 text-sm mb-1">{p.label}</p>
                  <p className="text-red-600 text-sm">{p.issue}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Solution ── */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-6">What Estimate Nepal Does</h2>
            <p className="text-gray-600 text-base leading-relaxed mb-8">
              Estimate Nepal replaces the entire manual estimating workflow with a connected, digital platform:
            </p>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "Upload PDF Drawings",
                  desc: "Upload your architectural, structural, or civil drawings. Each page is processed for digital measurement — no printing, no ruler required.",
                },
                {
                  step: "2",
                  title: "Measure Digitally",
                  desc: "Trace dimensions directly on your drawings. Measure lengths, areas, volumes, and counts. Set the scale once and every measurement auto-converts.",
                },
                {
                  step: "3",
                  title: "Link DUDBC Rates",
                  desc: "Connect each measurement to the relevant rate item from the DUDBC catalog — covering all 77 districts and updated each fiscal year. Use your own custom rates where needed.",
                },
                {
                  step: "4",
                  title: "Export Tender Documents",
                  desc: "Generate BOQ, rate analysis sheets, and tender documents as PDF or Excel in one click — professionally formatted and ready for submission.",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 mt-0.5">
                    {s.step}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-1">{s.title}</p>
                    <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Who It's For ── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-8">Who Uses Estimate Nepal</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {WHO_FOR.map((w) => (
                <div key={w.role} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:bg-blue-50/20 transition">
                  <p className="font-bold text-blue-600 text-sm mb-2">{w.role}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Values ── */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">Our Values</h2>
              <p className="text-gray-500 text-base max-w-lg mx-auto">
                The principles that guide every decision we make about the product.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              {VALUES.map((v) => (
                <div key={v.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 hover:border-blue-200 hover:bg-blue-50/30 transition">
                  <div className="text-3xl mb-3">{v.icon}</div>
                  <h3 className="font-bold text-gray-900 text-base mb-2">{v.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section className="py-16 px-4 bg-gray-50 border-t border-gray-100">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Get in Touch</h2>
            <p className="text-gray-500 text-base mb-8">
              Have a question, need a demo, or want to explore enterprise pricing? We&apos;d love to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition"
              >
                <span>✉</span>
                <span>{contactEmail}</span>
              </a>
              <a
                href={`https://wa.me/${contactWa.replace(/\D/g, "")}?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-400 text-white rounded-xl font-semibold text-sm transition"
              >
                <span>💬</span>
                <span>WhatsApp Us</span>
              </a>
            </div>
            <p className="text-gray-500 text-sm">
              Or{" "}
              <Link href="/register" className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2">
                start your free 14-day trial
              </Link>{" "}
              and explore the platform yourself — no credit card required.
            </p>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-gray-100 py-3 px-6 bg-white">
          <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <Logo size={22} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
              <a href={`mailto:${contactEmail}`} className="hover:text-gray-900 transition">{contactEmail}</a>
              <Link href="/" className="hover:text-gray-900 transition">Home</Link>
              <Link href="/faq" className="hover:text-gray-900 transition">FAQ</Link>
              <Link href="/register" className="hover:text-gray-900 transition">Register</Link>
            </div>
            <p className="text-xs text-gray-400">© {new Date().getFullYear()} Estimate Nepal</p>
          </div>
        </footer>
      </div>
    </>
  );
}
