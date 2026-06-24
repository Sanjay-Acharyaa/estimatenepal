import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Refund Policy | Estimate Nepal",
  description:
    "Estimate Nepal's refund and cancellation policy. Learn about our free trial, subscription billing, how to cancel, and when refunds are available.",
  keywords: ["Estimate Nepal refund policy", "cancellation policy Nepal SaaS", "construction software refund"],
  alternates: { canonical: "https://estimatenepal.com/refund" },
  openGraph: {
    title: "Refund Policy | Estimate Nepal",
    description: "Free trial, subscription billing, cancellation, and refund details for Estimate Nepal.",
    url: "https://estimatenepal.com/refund",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 24, 2026";

export default async function RefundPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const trialDays = cfg.trial_days || "14";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Refund Policy | Estimate Nepal",
    url: "https://estimatenepal.com/refund",
    description: "Refund and cancellation policy for Estimate Nepal subscriptions.",
    dateModified: "2026-06-24",
    publisher: { "@id": "https://estimatenepal.com/#org" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
        { "@type": "ListItem", position: 2, name: "Refund Policy", item: "https://estimatenepal.com/refund" },
      ],
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-h-screen bg-white font-sans">
        <PublicNav cfg={cfg} />

        {/* Page title */}
        <div className="border-b border-gray-200 px-4 py-8">
          <div className="max-w-3xl mx-auto">
            <nav className="text-xs text-gray-400 mb-2" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-gray-600 transition">Home</Link>
              <span className="mx-1.5">/</span>
              <span>Refund Policy</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Refund &amp; Cancellation Policy</h1>
            <p className="text-xs text-gray-400">Last Updated: {LAST_UPDATED}</p>
          </div>
        </div>

        {/* Quick summary cards */}
        <section className="bg-gray-50 border-b border-gray-100 py-8 px-4">
          <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4">
            {[
              { icon: "🎁", title: `${trialDays}-Day Free Trial`, desc: "No credit card required. Full access, zero risk." },
              { icon: "↩️", title: "7-Day Refund Window", desc: "Eligible within 7 days of your first paid charge." },
              { icon: "✕", title: "Cancel Anytime", desc: "No lock-in. Cancel in settings, effective end of period." },
            ].map((c) => (
              <div key={c.title} className="bg-white border border-gray-200 rounded-xl p-5 text-center">
                <div className="text-2xl mb-2">{c.icon}</div>
                <p className="font-semibold text-gray-900 text-sm mb-1">{c.title}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Content */}
        <article className="max-w-3xl mx-auto px-4 py-12">

          {/* 1 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Free Trial</h2>
            <p className="text-gray-600 leading-relaxed">
              All new accounts start with a <strong>{trialDays}-day free trial</strong>. No credit card is required to
              start your trial. During the trial you have full access to all platform features. At the end of the trial,
              you must subscribe to continue using the platform — your data is retained for an additional 7 days before
              the account is suspended.
            </p>
          </section>

          {/* 2 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Subscription Billing</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>Subscriptions are billed in advance — monthly or annually — on the date you subscribe.</li>
              <li>Annual subscriptions are charged in full at the start of each billing year.</li>
              <li>Your subscription auto-renews at the end of each billing period unless you cancel.</li>
              <li>All prices are in Nepali Rupees (NPR).</li>
            </ul>
          </section>

          {/* 3 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. How to Cancel</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              You can cancel your subscription at any time:
            </p>
            <ol className="list-decimal pl-5 text-gray-600 space-y-2">
              <li>Log in to your account.</li>
              <li>Go to <strong>Dashboard → Settings → Billing</strong>.</li>
              <li>Click <strong>Cancel Subscription</strong> and confirm.</li>
            </ol>
            <p className="text-gray-600 leading-relaxed mt-3">
              Cancellation takes effect at the end of your current billing period. You will retain full access until
              then. If you need help, email{" "}
              <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.
            </p>
          </section>

          {/* 4 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Refund Eligibility</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We offer a <strong>7-day money-back guarantee</strong> on your first payment for a new subscription. If you
              are not satisfied with Estimate Nepal after subscribing for the first time, contact us within 7 days of
              your first charge and we will issue a full refund — no questions asked.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800 font-medium mb-1">To request a refund:</p>
              <p className="text-sm text-blue-700">
                Email <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a> with your account
                email and reason (optional). We process refunds within 5–7 business days.
              </p>
            </div>
          </section>

          {/* 5 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Non-Refundable Situations</h2>
            <p className="text-gray-600 leading-relaxed mb-3">Refunds are <strong>not</strong> available for:</p>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>Renewal charges (second month onwards) — cancel before renewal to avoid future charges.</li>
              <li>Partial months or unused days within a billing period.</li>
              <li>Annual subscription charges after 7 days from the initial purchase.</li>
              <li>Accounts terminated for violating our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>.</li>
              <li>Accounts that received extended free trials or promotional credits.</li>
            </ul>
          </section>

          {/* 6 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Your Data After Cancellation</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>After cancellation, your account and all data remain accessible until the end of the paid period.</li>
              <li>After the paid period ends, your account is suspended but data is retained for <strong>30 days</strong>.</li>
              <li>During those 30 days you may reactivate your subscription to regain full access.</li>
              <li>After 30 days, all your data (projects, drawings, BOQs, measurements) is permanently deleted.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              We strongly recommend exporting your projects (BOQ Excel/PDF, measurement books) before cancelling.
            </p>
          </section>

          {/* 7 */}
          <section className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Contact Us</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-600 mb-1">
                Refund requests, billing questions, or cancellation help:
              </p>
              <p className="text-sm font-medium text-gray-800">
                <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
              </p>
              <p className="text-sm text-gray-500 mt-1">We respond within 1 business day (Nepal business hours).</p>
            </div>
          </section>

        </article>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
