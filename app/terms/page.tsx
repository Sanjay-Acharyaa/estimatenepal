import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Terms of Service | Estimate Nepal",
  description:
    "Read the Terms of Service for Estimate Nepal. These terms govern your use of our construction estimating platform, including account rules, billing, and intellectual property.",
  keywords: ["Estimate Nepal terms of service", "terms and conditions Nepal", "construction software terms", "SaaS terms Nepal"],
  alternates: { canonical: "https://estimatenepal.com/terms" },
  openGraph: {
    title: "Terms of Service | Estimate Nepal",
    description: "Terms and conditions governing your use of the Estimate Nepal platform.",
    url: "https://estimatenepal.com/terms",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 24, 2026";
const EFFECTIVE_DATE = "June 24, 2026";

export default async function TermsPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const trialDays = cfg.trial_days || "14";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Terms of Service | Estimate Nepal",
    url: "https://estimatenepal.com/terms",
    description: "Terms and conditions for using the Estimate Nepal construction estimating platform.",
    dateModified: "2026-06-24",
    publisher: { "@id": "https://estimatenepal.com/#org" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
        { "@type": "ListItem", position: 2, name: "Terms of Service", item: "https://estimatenepal.com/terms" },
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
              <span>Terms of Service</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Terms of Service</h1>
            <p className="text-xs text-gray-400">Effective: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last Updated: {LAST_UPDATED}</p>
          </div>
        </div>

        {/* Content */}
        <article className="max-w-3xl mx-auto px-4 py-12">

          <p className="text-gray-600 text-base leading-relaxed mb-8">
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using Estimate Nepal. By creating
            an account or using our platform, you agree to be bound by these Terms. If you do not agree, do not use our
            service.
          </p>

          {/* 1 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              These Terms constitute a legally binding agreement between you (&ldquo;User&rdquo; or &ldquo;you&rdquo;)
              and Estimate Nepal (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By registering for an
              account, you confirm that you are at least 18 years old (or the legal age of majority in your jurisdiction),
              that you have read and understood these Terms, and that you have the authority to bind yourself or the
              organisation you represent.
            </p>
          </section>

          {/* 2 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Estimate Nepal is a web-based SaaS platform for construction professionals in Nepal. The service includes:
            </p>
            <ul className="list-disc pl-5 text-gray-600 space-y-1.5">
              <li>Bill of Quantities (BOQ) generation using DUDBC rates</li>
              <li>Digital quantity takeoff from PDF drawings</li>
              <li>Tender document export (PDF and Excel)</li>
              <li>Team collaboration and role-based access</li>
              <li>Project and bid management dashboard</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              We reserve the right to modify, suspend, or discontinue any feature of the service at any time with
              reasonable notice.
            </p>
          </section>

          {/* 3 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Account Registration</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>You must provide accurate, complete, and current information when registering.</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You are responsible for all activities that occur under your account.</li>
              <li>You must notify us immediately at{" "}<a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>{" "}if you suspect unauthorised access to your account.</li>
              <li>One person may not maintain more than one account without our express permission.</li>
            </ul>
          </section>

          {/* 4 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Acceptable Use</h2>
            <p className="text-gray-600 leading-relaxed mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>Use the platform for any unlawful purpose or in violation of any applicable laws of Nepal or your country.</li>
              <li>Upload or transmit content that infringes on any third party&apos;s intellectual property rights.</li>
              <li>Attempt to gain unauthorised access to any part of the service or another user&apos;s account.</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the platform.</li>
              <li>Use automated tools (bots, scrapers) to access or extract data from the service without our written permission.</li>
              <li>Upload malicious code, viruses, or any software intended to damage our systems or other users&apos; data.</li>
              <li>Resell or sublicense access to the platform without written authorisation from us.</li>
            </ul>
          </section>

          {/* 5 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Intellectual Property</h2>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Your Data</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              You retain full ownership of all data, drawings, measurements, and documents you create or upload (&ldquo;User Content&rdquo;). By using the service, you grant us a limited licence to store, process, and display your User Content solely for the purpose of providing the service to you.
            </p>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Our Platform</h3>
            <p className="text-gray-600 leading-relaxed">
              Estimate Nepal — including its design, code, features, DUDBC rate database, and branding — is owned by us
              and protected by intellectual property laws. You may not copy, reproduce, or create derivative works from
              our platform without explicit written permission.
            </p>
          </section>

          {/* 6 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Payment and Billing</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>Estimate Nepal offers a <strong>{trialDays}-day free trial</strong> with no credit card required.</li>
              <li>After the trial, continued use requires an active paid subscription.</li>
              <li>Subscriptions are billed monthly or annually as selected at checkout.</li>
              <li>All prices are listed in Nepali Rupees (NPR) and are subject to applicable taxes.</li>
              <li>We reserve the right to change pricing with at least 30 days&apos; notice to existing subscribers.</li>
              <li>Non-payment may result in suspension or termination of your account.</li>
            </ul>
          </section>

          {/* 7 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Cancellation</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              You may cancel your subscription at any time from your account settings. Cancellation takes effect at the
              end of the current billing period. See our{" "}
              <Link href="/refund" className="text-blue-600 hover:underline">Refund Policy</Link> for details on
              eligibility for refunds.
            </p>
            <p className="text-gray-600 leading-relaxed">
              After cancellation, your account and data are retained for 30 days, giving you time to export your work.
              After 30 days, your data is permanently deleted.
            </p>
          </section>

          {/* 8 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Service Availability</h2>
            <p className="text-gray-600 leading-relaxed">
              We aim to maintain high availability but do not guarantee 100% uptime. Planned maintenance will be
              communicated in advance where possible. We are not liable for losses caused by temporary service
              unavailability due to maintenance, infrastructure issues, or circumstances beyond our reasonable control
              (force majeure).
            </p>
          </section>

          {/* 9 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Disclaimer of Warranties</h2>
            <p className="text-gray-600 leading-relaxed">
              The service is provided <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as available&rdquo;</strong>{" "}
              without any warranties, express or implied. We do not warrant that the service will be error-free, secure,
              or uninterrupted, or that any BOQ outputs are accurate enough for submission without independent
              professional review. DUDBC rates in our database are updated periodically but may not always reflect the
              most current published rates — always verify critical rates with official DUDBC sources before tender
              submission.
            </p>
          </section>

          {/* 10 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              To the maximum extent permitted by applicable law, Estimate Nepal and its owners, employees, and affiliates
              shall not be liable for any indirect, incidental, consequential, or punitive damages arising from your use
              or inability to use the service, including but not limited to errors in BOQ outputs, data loss, or loss of
              business. Our total liability to you for any direct damages shall not exceed the amount you paid us in the
              three months preceding the claim.
            </p>
          </section>

          {/* 11 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Indemnification</h2>
            <p className="text-gray-600 leading-relaxed">
              You agree to indemnify and hold harmless Estimate Nepal from any claims, damages, losses, or expenses
              (including legal fees) arising from your violation of these Terms, your use of the service, or your
              User Content.
            </p>
          </section>

          {/* 12 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Governing Law</h2>
            <p className="text-gray-600 leading-relaxed">
              These Terms are governed by and construed in accordance with the laws of Nepal. Any disputes arising from
              these Terms shall be subject to the exclusive jurisdiction of the courts of Kathmandu, Nepal.
            </p>
          </section>

          {/* 13 */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">13. Changes to These Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these Terms from time to time. We will notify you of material changes by email or by a
              prominent notice in the platform. Continued use of the service after the effective date of revised Terms
              constitutes acceptance of the new Terms.
            </p>
          </section>

          {/* 14 */}
          <section className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-3">14. Contact</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-600">
                Questions about these Terms? Email us at{" "}
                <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
              </p>
            </div>
          </section>

        </article>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
