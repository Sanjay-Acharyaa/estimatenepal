import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | Estimate Nepal",
  description:
    "Learn how Estimate Nepal collects, uses, stores, and protects your personal data. We are committed to your privacy and data security.",
  keywords: ["Estimate Nepal privacy policy", "data protection Nepal", "construction software privacy", "user data policy"],
  alternates: { canonical: "https://estimatenepal.com/privacy" },
  openGraph: {
    title: "Privacy Policy | Estimate Nepal",
    description: "How Estimate Nepal handles and protects your personal and project data.",
    url: "https://estimatenepal.com/privacy",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 24, 2026";
const EFFECTIVE_DATE = "June 24, 2026";

export default async function PrivacyPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Privacy Policy | Estimate Nepal",
    url: "https://estimatenepal.com/privacy",
    description: "Estimate Nepal's privacy policy — how we collect, use, and protect your data.",
    dateModified: "2026-06-24",
    publisher: { "@id": "https://estimatenepal.com/#org" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
        { "@type": "ListItem", position: 2, name: "Privacy Policy", item: "https://estimatenepal.com/privacy" },
      ],
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-h-screen bg-white font-sans">
        <PublicNav cfg={cfg} />

        {/* Hero */}
        <section className="bg-gradient-to-b from-blue-950 to-blue-900 text-white py-12 px-4">
          <div className="max-w-3xl mx-auto">
            <nav className="text-sm text-blue-300 mb-4" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-white transition">Home</Link>
              <span className="mx-2 text-blue-500">/</span>
              <span className="text-blue-100">Privacy Policy</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">Privacy Policy</h1>
            <p className="text-blue-200 text-sm">
              Effective: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last Updated: {LAST_UPDATED}
            </p>
          </div>
        </section>

        {/* Content */}
        <article className="max-w-3xl mx-auto px-4 py-12 prose prose-gray prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-600 prose-li:text-gray-600 max-w-none">

          <p className="text-gray-600 text-base leading-relaxed mb-8">
            Estimate Nepal (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the website{" "}
            <a href="https://estimatenepal.com" className="text-blue-600 hover:underline">estimatenepal.com</a> and
            the Estimate Nepal SaaS platform. This Privacy Policy explains what personal data we collect, why we collect
            it, how we use and protect it, and what rights you have over your data.
          </p>

          {/* 1 */}
          <section id="data-controller" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Data Controller</h2>
            <p className="text-gray-600 leading-relaxed">
              Estimate Nepal is the data controller for personal data collected through this platform. We are based in
              Kathmandu, Nepal. For data-related enquiries, contact us at{" "}
              <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.
            </p>
            {/* Placeholder — add company details once registered */}
            {/* <p className="text-gray-500 text-sm mt-2">Company Reg. No: [TBD] | PAN: [TBD]</p> */}
          </section>

          {/* 2 */}
          <section id="what-we-collect" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Information We Collect</h2>

            <h3 className="text-base font-semibold text-gray-800 mb-2">a) Account Information</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              When you register, we collect your <strong>name</strong>, <strong>email address</strong>, and a
              <strong> hashed version of your password</strong> (we never store your plain-text password). If you belong
              to an organisation on Estimate Nepal, we also store your organisation name and role.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mb-2">b) Project and Work Data</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              When you use Estimate Nepal, we store the data you create: project details, PDF drawings you upload,
              takeoff measurements, BOQ items, rates, and exported documents. This data belongs to you — we process it
              solely to provide the service.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mb-2">c) Usage Data</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              We automatically collect information about how you use the platform — pages visited, features used, actions
              taken, and timestamps. This helps us improve the product.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mb-2">d) Technical Data</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              We collect IP addresses, browser type, operating system, and device type for security monitoring (e.g.
              detecting suspicious login attempts) and for diagnosing technical issues.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mb-2" id="cookies">e) Cookies</h3>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li><strong>Essential cookies</strong> — required for authentication (keeping you logged in) and security. These cannot be disabled.</li>
              <li><strong>Analytics cookies</strong> — optional. Google Analytics 4 (GA4) tracks aggregated usage patterns. Only set if you accept cookies via our consent banner.</li>
              <li><strong>Marketing cookies</strong> — optional. Facebook Pixel may be present if configured. Only activated with your consent.</li>
            </ul>
          </section>

          {/* 3 */}
          <section id="how-we-use" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>To create and manage your account and provide access to the platform.</li>
              <li>To store and process your project data (drawings, BOQs, measurements) on your behalf.</li>
              <li>To send transactional emails — account verification, password resets, billing receipts.</li>
              <li>To improve the platform using aggregated, anonymised usage analytics.</li>
              <li>To detect and prevent fraud, abuse, and unauthorised access.</li>
              <li>To respond to support requests and enquiries.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              We do <strong>not</strong> sell your personal data to third parties. We do <strong>not</strong> use your
              project data to train AI models or share it with competitors.
            </p>
          </section>

          {/* 4 */}
          <section id="data-storage" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Data Storage &amp; Security</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>All data is stored on secure cloud servers. Data in transit is encrypted using TLS (HTTPS).</li>
              <li>Passwords are hashed using bcrypt with a salt — even if our database were breached, your plain-text password cannot be recovered.</li>
              <li>Access to production systems is restricted to authorised personnel only.</li>
              <li>We perform regular database backups.</li>
              <li>Sessions are invalidated server-side on password change or logout from all devices.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              For full details, see our <Link href="/security" className="text-blue-600 hover:underline">Security page</Link>.
            </p>
          </section>

          {/* 5 */}
          <section id="third-parties" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Third-Party Services</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We use a small number of third-party services to operate the platform:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Service</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Purpose</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Cloud VPS Provider</td>
                    <td className="px-4 py-3 text-gray-600">Hosting &amp; infrastructure</td>
                    <td className="px-4 py-3 text-gray-600">All stored data (encrypted)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Resend</td>
                    <td className="px-4 py-3 text-gray-600">Transactional email delivery</td>
                    <td className="px-4 py-3 text-gray-600">Name, email address</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Google Analytics 4</td>
                    <td className="px-4 py-3 text-gray-600">Usage analytics (optional)</td>
                    <td className="px-4 py-3 text-gray-600">Anonymised usage data</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Facebook Pixel</td>
                    <td className="px-4 py-3 text-gray-600">Marketing analytics (optional)</td>
                    <td className="px-4 py-3 text-gray-600">Page view events</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 text-sm mt-3">Optional services are only activated if you accept analytics cookies via the consent banner.</p>
          </section>

          {/* 6 */}
          <section id="data-retention" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>Your account data and project data are retained for as long as your account is active.</li>
              <li>After you delete your account, we retain your data for up to <strong>30 days</strong> to allow for recovery, then permanently delete it.</li>
              <li>Backups may retain data for up to <strong>60 additional days</strong> before automatic deletion.</li>
              <li>Audit logs (for security purposes) may be retained for up to <strong>12 months</strong>.</li>
            </ul>
          </section>

          {/* 7 */}
          <section id="your-rights" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Your Rights</h2>
            <p className="text-gray-600 leading-relaxed mb-3">You have the right to:</p>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong>Rectification</strong> — update inaccurate personal data in your account settings.</li>
              <li><strong>Erasure</strong> — request deletion of your account and associated data.</li>
              <li><strong>Data portability</strong> — export your project data (BOQ, measurements) using our Excel/PDF export tools before closing your account.</li>
              <li><strong>Withdraw consent</strong> — opt out of analytics cookies at any time by clicking &ldquo;Essential Only&rdquo; in the cookie banner or clearing your browser cookies.</li>
              <li><strong>Object</strong> — object to how we process your data by contacting us.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              To exercise any of these rights, email us at{" "}
              <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>. We will
              respond within 30 days.
            </p>
          </section>

          {/* 8 */}
          <section id="childrens-privacy" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Children&apos;s Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              Estimate Nepal is intended for construction and engineering professionals and is not directed at anyone
              under the age of 13. We do not knowingly collect personal data from children. If you believe a child has
              provided us data, contact us and we will delete it promptly.
            </p>
          </section>

          {/* 9 */}
          <section id="changes" className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time. When we make material changes, we will notify you by
              email or by posting a notice in the platform. The &ldquo;Last Updated&rdquo; date at the top of this page
              reflects the most recent revision. Continued use of the service after changes are posted constitutes your
              acceptance of the updated policy.
            </p>
          </section>

          {/* 10 */}
          <section id="contact" className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Contact Us</h2>
            <p className="text-gray-600 leading-relaxed">
              For any privacy-related questions, data requests, or concerns, please contact us:
            </p>
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-800 mb-1">Estimate Nepal — Privacy Team</p>
              <p className="text-sm text-gray-600">
                Email:{" "}
                <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
              </p>
              <p className="text-sm text-gray-600">Location: Kathmandu, Nepal</p>
              {/* <p className="text-sm text-gray-500">Reg. No: [TBD] | PAN: [TBD]</p> */}
            </div>
          </section>

        </article>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
