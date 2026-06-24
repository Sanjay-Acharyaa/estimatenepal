import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Contact Us | Estimate Nepal",
  description:
    "Get in touch with Estimate Nepal. We're here to help with support, demos, pricing, and any questions about our construction estimating platform.",
  keywords: [
    "contact Estimate Nepal",
    "Estimate Nepal support",
    "construction software Nepal contact",
    "BOQ software support Nepal",
  ],
  alternates: { canonical: "https://estimatenepal.com/contact" },
  openGraph: {
    title: "Contact Us | Estimate Nepal",
    description: "Reach the Estimate Nepal team for support, demos, or any questions.",
    url: "https://estimatenepal.com/contact",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default async function ContactPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const contactWa = cfg.contact_whatsapp || "+977XXXXXXXXX";
  const waMsg = encodeURIComponent(
    cfg.whatsapp_message || "Hi, I have a question about Estimate Nepal."
  );
  const waNumber = contactWa.replace(/\D/g, "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact Us | Estimate Nepal",
    url: "https://estimatenepal.com/contact",
    description: "Contact the Estimate Nepal team for support, sales, or any questions.",
    publisher: { "@id": "https://estimatenepal.com/#org" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
        { "@type": "ListItem", position: 2, name: "Contact", item: "https://estimatenepal.com/contact" },
      ],
    },
  };

  const TOPICS = [
    { icon: "🚀", title: "Getting Started", desc: "New to Estimate Nepal? We'll walk you through setup and your first project." },
    { icon: "💰", title: "Pricing & Plans", desc: "Questions about which plan fits your team or custom enterprise pricing." },
    { icon: "🛠️", title: "Technical Support", desc: "Bug reports, unexpected behaviour, or help with a specific feature." },
    { icon: "🤝", title: "Partnership", desc: "Integration requests, reseller enquiries, or professional training." },
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
              <span>Contact</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Contact Us</h1>
            <p className="text-xs text-gray-500">Questions, demos, or just exploring — we&apos;re happy to help.</p>
          </div>
        </div>

        {/* Contact methods */}
        <section className="py-12 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="grid sm:grid-cols-2 gap-6 mb-12">

              {/* Email */}
              <a
                href={`mailto:${contactEmail}`}
                className="group flex flex-col gap-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl p-6 transition"
              >
                <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center text-xl transition">
                  ✉️
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base mb-1">Email Us</h2>
                  <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                    For support, billing, or general enquiries. We typically respond within 1 business day.
                  </p>
                  <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 transition">
                    {contactEmail}
                  </span>
                </div>
              </a>

              {/* WhatsApp */}
              <a
                href={`https://wa.me/${waNumber}?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-3 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-300 rounded-2xl p-6 transition"
              >
                <div className="w-10 h-10 bg-green-100 group-hover:bg-green-200 rounded-xl flex items-center justify-center text-xl transition">
                  💬
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base mb-1">WhatsApp</h2>
                  <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                    Fastest way to reach us for quick questions or to book a live demo. Available during business hours.
                  </p>
                  <span className="text-sm font-semibold text-green-600 group-hover:text-green-700 transition">
                    Chat on WhatsApp →
                  </span>
                </div>
              </a>
            </div>

            {/* Business hours */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-12">
              <h2 className="font-bold text-gray-900 text-base mb-4">Support Hours</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-700 mb-1">Email Support</p>
                  <p className="text-gray-500">Sunday – Friday</p>
                  <p className="text-gray-500">10:00 AM – 6:00 PM NPT</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 mb-1">WhatsApp / Live Chat</p>
                  <p className="text-gray-500">Sunday – Friday</p>
                  <p className="text-gray-500">10:00 AM – 5:00 PM NPT</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4">NPT = Nepal Standard Time (UTC+5:45). We are closed on Saturdays and public holidays.</p>
            </div>

            {/* Topics */}
            <h2 className="text-xl font-bold text-gray-900 mb-5">What can we help you with?</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-12">
              {TOPICS.map((t) => (
                <div key={t.title} className="flex gap-3 items-start bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <span className="text-xl flex-shrink-0">{t.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm mb-1">{t.title}</p>
                    <p className="text-gray-500 text-xs leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Location */}
            <div className="border-t border-gray-100 pt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Our Location</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-600">
                <p className="font-semibold text-gray-800 mb-1">Estimate Nepal</p>
                <p>Kathmandu, Nepal</p>
                {/* Placeholder — add full address when registered */}
                {/* <p>[Street Address]</p> */}
                {/* <p>Reg. No: [TBD] | PAN: [TBD]</p> */}
                <p className="mt-2">
                  <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-white text-center">
              <h2 className="text-xl font-bold mb-2">Not sure yet? Try it free.</h2>
              <p className="text-blue-200 text-sm mb-5">
                Start your {cfg.trial_days || "14"}-day free trial — no credit card, no commitment. See how much faster you can estimate.
              </p>
              <Link
                href="/register"
                className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-xl font-bold text-sm transition"
              >
                Start Free Trial →
              </Link>
            </div>
          </div>
        </section>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
