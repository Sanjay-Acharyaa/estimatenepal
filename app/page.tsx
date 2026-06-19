import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "NepaliEstimate — Construction Estimating Software for Nepal",
  description:
    "Generate BOQ, analyse DUDBC rates, export tender documents, and measure directly on PDF drawings. Built for Nepali construction professionals.",
  openGraph: {
    title: "NepaliEstimate — Construction Estimating Software",
    description:
      "The fastest way to estimate construction costs in Nepal. DUDBC rates, BOQ, drawings — all in one platform.",
    url: "https://estimatenepal.com",
    siteName: "NepaliEstimate",
    type: "website",
  },
  keywords: [
    "construction estimating Nepal",
    "DUDBC rates",
    "BOQ software Nepal",
    "tender document Nepal",
    "quantity takeoff Nepal",
    "NepaliEstimate",
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
  {
    n: "1",
    title: "Upload Your Drawings",
    desc: "Upload project PDFs. Each page is processed for digital measurement.",
  },
  {
    n: "2",
    title: "Measure & Apply Rates",
    desc: "Trace measurements on drawings and link them to DUDBC or your custom rates.",
  },
  {
    n: "3",
    title: "Export & Win Bids",
    desc: "Generate BOQ, rate analysis, and tender documents in one click.",
  },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">NE</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">NepaliEstimate</span>
          </div>
          <nav className="flex items-center gap-3">
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
            3-Day Free Trial — No Credit Card Required
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
              Start 3-Day Free Trial →
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
            {/* Browser chrome */}
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
            {/* App layout */}
            <div className="flex h-64 sm:h-80">
              {/* Sidebar */}
              <div className="w-44 bg-blue-900 p-3 space-y-1 shrink-0">
                <div className="text-xs text-blue-400 uppercase tracking-wider px-3 py-1 mb-2">
                  NepaliEstimate
                </div>
                {["Dashboard", "Projects", "Rates", "Assemblies", "Team"].map((item, i) => (
                  <div
                    key={item}
                    className={`px-3 py-2 rounded-lg text-xs font-medium ${
                      i === 1
                        ? "bg-blue-600 text-white"
                        : "text-blue-300 hover:bg-blue-800"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
                {/* Stats row */}
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
                {/* Project list */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-4 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span>Project</span>
                    <span>Status</span>
                    <span>Value</span>
                    <span>Bid Due</span>
                  </div>
                  {[
                    { name: "School Building, Lalitpur", val: "NPR 24.5M", due: "2026-08-15" },
                    { name: "Road Upgrade, Pokhara", val: "NPR 38.2M", due: "2026-09-01" },
                    { name: "Bridge, Chitwan", val: "NPR 55.0M", due: "2026-09-20" },
                  ].map((p, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-4 px-3 py-2.5 border-b border-gray-50 text-xs text-gray-700 items-center"
                    >
                      <span className="font-medium truncate">{p.name}</span>
                      <span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          Active
                        </span>
                      </span>
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
              <div
                key={f.title}
                className="bg-gray-50 border border-gray-100 rounded-2xl p-6 hover:border-blue-200 hover:bg-blue-50/30 transition group"
              >
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

      {/* ── Trial CTA ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-10 text-center text-white shadow-xl">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-3xl font-extrabold mb-3">Start your free trial today</h2>
            <p className="text-blue-200 text-base mb-8 max-w-md mx-auto">
              3 days of full access — no credit card, no commitment. See how much
              faster your team can estimate.
            </p>
            <Link
              href="/register"
              className="inline-block px-10 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-xl font-bold text-lg shadow-lg transition"
            >
              Create Your Free Account →
            </Link>
            <p className="text-blue-300 text-sm mt-6">
              After your trial, contact us at{" "}
              <a
                href="mailto:hello@estimatenepal.com"
                className="underline text-blue-100 hover:text-white"
              >
                hello@estimatenepal.com
              </a>{" "}
              to continue.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-10 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">NE</span>
            </div>
            <span className="font-semibold text-gray-700 text-sm">NepaliEstimate</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="mailto:hello@estimatenepal.com" className="hover:text-gray-900 transition">
              hello@estimatenepal.com
            </a>
            <Link href="/login" className="hover:text-gray-900 transition">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-gray-900 transition">
              Register
            </Link>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} NepaliEstimate. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
