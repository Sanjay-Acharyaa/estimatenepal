import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Security | Estimate Nepal",
  description:
    "How Estimate Nepal protects your construction data — encryption, secure authentication, infrastructure security, backups, and responsible vulnerability disclosure.",
  keywords: [
    "Estimate Nepal security",
    "data security Nepal SaaS",
    "construction data protection",
    "secure BOQ platform Nepal",
  ],
  alternates: { canonical: "https://estimatenepal.com/security" },
  openGraph: {
    title: "Security | Estimate Nepal",
    description: "How Estimate Nepal keeps your project data safe — encryption, authentication, backups, and more.",
    url: "https://estimatenepal.com/security",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default async function SecurityPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Security | Estimate Nepal",
    url: "https://estimatenepal.com/security",
    description: "Security practices and data protection measures used by Estimate Nepal.",
    dateModified: "2026-06-24",
    publisher: { "@id": "https://estimatenepal.com/#org" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
        { "@type": "ListItem", position: 2, name: "Security", item: "https://estimatenepal.com/security" },
      ],
    },
  };

  const PILLARS = [
    {
      icon: "🔒",
      title: "Data Encryption",
      items: [
        "All data in transit is encrypted using TLS 1.2/1.3 (HTTPS). Connections over plain HTTP are automatically redirected to HTTPS.",
        "Sensitive values stored in our database (tokens, keys) are encrypted at rest.",
        "File uploads (drawings, documents) are stored with server-side encryption.",
      ],
    },
    {
      icon: "🔑",
      title: "Authentication & Access",
      items: [
        "Passwords are hashed using bcrypt with a cost factor of 10 — your plain-text password is never stored.",
        "Sessions are JWT-based with a 7-day maximum lifetime. Sessions are invalidated server-side on password change or when a new login from another device is detected.",
        "Rate limiting is enforced on login, registration, and password reset endpoints to prevent brute-force attacks.",
        "Role-based access control (RBAC) ensures users can only access data belonging to their own organisation.",
      ],
    },
    {
      icon: "🖥️",
      title: "Infrastructure",
      items: [
        "The platform runs on a managed cloud VPS with firewall rules restricting unnecessary port exposure.",
        "The application runs as a dedicated user without root privileges (PM2 process manager).",
        "Database access is restricted to the application server — the MySQL database is not publicly accessible.",
        "Redis (used for caching and session tracking) is bound to localhost only.",
      ],
    },
    {
      icon: "💾",
      title: "Backups",
      items: [
        "Database backups are performed regularly.",
        "File uploads are backed up to a separate storage location.",
        "Backups are retained for a minimum of 30 days.",
        "Restoration procedures are tested periodically.",
      ],
    },
    {
      icon: "👁️",
      title: "Monitoring & Audit Logs",
      items: [
        "All significant actions (login, data export, rate override, member changes) are written to an immutable audit log.",
        "Failed login attempts are tracked and used to enforce rate limits.",
        "Server logs are monitored for anomalous patterns.",
      ],
    },
    {
      icon: "🔄",
      title: "Dependency & Code Security",
      items: [
        "Dependencies are kept up to date and scanned for known vulnerabilities.",
        "The codebase follows OWASP guidelines — inputs are validated and sanitised, SQL queries use parameterised statements via Prisma ORM, and XSS protections are enforced by Next.js.",
        "API endpoints are protected by authentication and tenant isolation — a user cannot access another organisation's data.",
      ],
    },
  ];

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
              <span>Security</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Security at Estimate Nepal</h1>
            <p className="text-xs text-gray-500">Your project data is protected at every layer — from your password to our servers.</p>
          </div>
        </div>

        {/* Summary badges */}
        <section className="bg-gray-50 border-b border-gray-100 py-6 px-4">
          <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-3">
            {["HTTPS / TLS Encrypted", "bcrypt Password Hashing", "Tenant Data Isolation", "Audit Logs", "Regular Backups", "Rate Limiting"].map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1.5 bg-white border border-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <span className="text-green-500">✓</span> {badge}
              </span>
            ))}
          </div>
        </section>

        {/* Content */}
        <article className="max-w-3xl mx-auto px-4 py-12">
          <div className="space-y-10">
            {PILLARS.map((pillar) => (
              <section key={pillar.title}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{pillar.icon}</span>
                  <h2 className="text-xl font-bold text-gray-900">{pillar.title}</h2>
                </div>
                <ul className="space-y-2.5">
                  {pillar.items.map((item, i) => (
                    <li key={i} className="flex gap-3 text-gray-600 text-sm leading-relaxed">
                      <span className="text-green-500 font-bold flex-shrink-0 mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Responsible disclosure */}
          <section className="mt-12 bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🐛 Responsible Disclosure</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-3">
              If you discover a security vulnerability in Estimate Nepal, we ask that you report it to us privately
              before disclosing it publicly. We take all security reports seriously and will work to fix confirmed issues
              quickly.
            </p>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Please email your findings to{" "}
              <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline font-medium">{contactEmail}</a>{" "}
              with the subject line <strong>&ldquo;Security Vulnerability Report&rdquo;</strong>. Include a description
              of the vulnerability, steps to reproduce, and its potential impact.
            </p>
            <p className="text-gray-500 text-xs">
              We do not currently operate a bug bounty programme, but we genuinely appreciate the security community's
              efforts and will acknowledge responsible reports.
            </p>
          </section>

          {/* Last updated */}
          <p className="text-xs text-gray-400 mt-10 text-center">Security page last reviewed: June 2026.</p>
        </article>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
