import type { Metadata } from "next";
import Link from "next/link";
import { getAllConfigs } from "@/lib/config";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FaqAccordion } from "./FaqAccordion";
import type { FaqCategory } from "./FaqAccordion";

export const metadata: Metadata = {
  title: "FAQ — Frequently Asked Questions | Estimate Nepal",
  description:
    "Answers to common questions about Estimate Nepal — DUDBC rates, BOQ generation, pricing, trial, data security, and getting started with Nepal's construction estimating platform.",
  keywords: [
    "Estimate Nepal FAQ",
    "DUDBC rates questions",
    "BOQ software Nepal FAQ",
    "construction estimating Nepal help",
    "Nepal construction software pricing",
    "quantity survey software Nepal",
  ],
  alternates: { canonical: "https://estimatenepal.com/faq" },
  openGraph: {
    title: "FAQ | Estimate Nepal",
    description:
      "Frequently asked questions about Estimate Nepal — Nepal's construction estimating platform.",
    url: "https://estimatenepal.com/faq",
    siteName: "Estimate Nepal",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    category: "General",
    items: [
      {
        q: "What is Estimate Nepal?",
        a: "Estimate Nepal is a web-based construction cost estimating platform built specifically for Nepal. It helps civil engineers, quantity surveyors, architects, and contractors create accurate Bills of Quantities (BOQ) using official DUDBC rates, measure PDF drawings digitally, and export professional tender documents — all in one place.",
      },
      {
        q: "Who is Estimate Nepal built for?",
        a: "Estimate Nepal is designed for construction professionals in Nepal — including civil engineers, quantity surveyors (QS), contractors, architects, and project managers. It is especially useful for anyone who creates BOQs, prepares bid documents, or submits tenders for government or private construction projects in Nepal.",
      },
      {
        q: "Do I need to install any software?",
        a: "No installation is required. Estimate Nepal is fully web-based and runs in your browser on any device — desktop, laptop, or tablet. You just need an internet connection and a modern browser (Chrome, Edge, Firefox, or Safari).",
      },
      {
        q: "What countries does Estimate Nepal support?",
        a: "Estimate Nepal is purpose-built for Nepal. The rate catalog covers all 77 districts of Nepal using official DUDBC fiscal-year rates. While the core functionality works anywhere, the rate database and district pricing are specific to Nepal's construction industry.",
      },
    ],
  },
  {
    category: "DUDBC & BOQ",
    items: [
      {
        q: "What are DUDBC rates?",
        a: "DUDBC rates are the official construction cost rates published by Nepal's Department of Urban Development and Building Construction (DUDBC). They provide standardised labour, material, and equipment costs for all types of construction work across all 77 districts of Nepal. These rates are updated each fiscal year and are widely used for government project tendering.",
      },
      {
        q: "How do I create a BOQ using DUDBC rates?",
        a: "Upload your PDF drawings, use the digital takeoff tools to measure lengths, areas, volumes, and counts directly on the drawings, then link each measurement to the relevant DUDBC rate item from the catalog. Estimate Nepal automatically computes the cost breakdown and generates a complete BOQ, ready for export as PDF or Excel.",
      },
      {
        q: "Does Estimate Nepal cover all 77 districts of Nepal?",
        a: "Yes. The DUDBC rate catalog in Estimate Nepal includes district-specific rates for all 77 districts of Nepal. When you create a project, you select the district and the correct district rates are applied automatically.",
      },
      {
        q: "Can I use my own custom rates alongside DUDBC rates?",
        a: "Yes. You can import your own custom rate schedules or create individual custom rate items. Custom rates can be used alongside DUDBC rates within the same project. You can also build an assembly library of grouped rates for common construction tasks.",
      },
      {
        q: "What is a rate analysis in Estimate Nepal?",
        a: "Rate analysis is a detailed cost breakdown of a single work item — showing the material cost, skilled labour, semi-skilled labour, unskilled labour, and equipment cost as separate line items. Estimate Nepal generates rate analysis sheets aligned with DUDBC format, which can be exported for tender submission.",
      },
    ],
  },
  {
    category: "Features",
    items: [
      {
        q: "How does the PDF drawing takeoff work?",
        a: "Upload your PDF drawings (architectural, structural, or civil). Estimate Nepal processes each page so you can measure directly on it. Set the drawing scale once using a known dimension, then use the tools to draw lengths (roads, walls), areas (slabs, floors), volumes (earthwork), or count items (doors, columns). All measurements are stored and linked to your BOQ.",
      },
      {
        q: "What can I export from Estimate Nepal?",
        a: "You can export: (1) Bill of Quantities (BOQ) as PDF or Excel, (2) Rate Analysis sheets for each work item, (3) Measurement Books (MB) with full takeoff detail, (4) Complete tender documents formatted for submission. All exports follow formats suitable for government and private sector construction tenders in Nepal.",
      },
      {
        q: "Does Estimate Nepal support team collaboration?",
        a: "Yes. You can invite team members to your organisation and assign them roles: Owner, Admin, or Member. Within each project, you can further assign project-level roles: Lead, Estimator, or Viewer. All team members work in the same live project — no file emailing or version conflicts.",
      },
      {
        q: "Can I manage multiple projects at once?",
        a: "Yes. The Project Dashboard gives you an overview of all active bids, projects in progress, pending deadlines, and bid values at a glance. You can filter by status, priority, and district, and track which team members are assigned to each project.",
      },
    ],
  },
  {
    category: "Pricing & Trial",
    items: [
      {
        q: "Is there a free trial?",
        a: "Yes. Estimate Nepal offers a 14-day free trial with full access to all features — no credit card required. You can upload drawings, create BOQs, run rate analyses, and export documents during your trial. At the end of the trial, you choose a plan to continue.",
      },
      {
        q: "What plans are available and what do they cost?",
        a: "Estimate Nepal offers three standard plans: Solo (1 user, NPR 999/month), Team of 3 (up to 3 users, NPR 1,999/month), and Team of 5 (up to 5 users, NPR 3,000/month). For teams of 6 or more, Enterprise pricing is available per seat. Annual billing saves you 2 months (pay for 10, get 12).",
      },
      {
        q: "What happens to my data if my trial expires or I cancel?",
        a: "Your project data, drawings, and BOQs are safely preserved even after your trial ends or subscription lapses. You will not be able to create new exports or access editing features on an expired account, but your data remains intact. You can upgrade at any time to regain full access.",
      },
    ],
  },
  {
    category: "Security & Data",
    items: [
      {
        q: "Is my project data secure?",
        a: "Yes. All data is encrypted in transit using HTTPS. Files uploaded to Estimate Nepal are stored in secure cloud object storage. Access is controlled by role-based permissions — only authorised org members can view your projects. We do not share your data with third parties.",
      },
      {
        q: "Where is my data stored?",
        a: "Estimate Nepal stores all project data and files on servers hosted in the cloud with industry-standard security practices. We do not sell or share your project information with any third party.",
      },
    ],
  },
  {
    category: "Getting Started",
    items: [
      {
        q: "How do I get started with Estimate Nepal?",
        a: "Click 'Start Free Trial' on the homepage, fill in your name, email, and organisation name, then verify your email. You will be taken directly to your dashboard. From there, create your first project, upload a PDF drawing, and start measuring — the interface is designed to be intuitive for construction professionals.",
      },
      {
        q: "How do I contact support?",
        a: "You can reach the Estimate Nepal team by email at hello@estimatenepal.com or via WhatsApp. Response times are typically within one business day. For quick questions, WhatsApp is usually faster.",
      },
    ],
  },
];

export default async function FaqPage() {
  const cfg = await getAllConfigs();
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const contactWa = cfg.contact_whatsapp || "+977XXXXXXXXX";

  // Build FAQ JSON-LD from the same data source
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_CATEGORIES.flatMap((cat) =>
      cat.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      }))
    ),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://estimatenepal.com" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://estimatenepal.com/faq" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="min-h-screen bg-white font-sans">
        <PublicNav cfg={cfg} />

        {/* Page title */}
        <div className="border-b border-gray-200 px-4 py-8">
          <div className="max-w-3xl mx-auto">
            <nav className="text-xs text-gray-400 mb-2" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-gray-600 transition">Home</Link>
              <span className="mx-1.5">/</span>
              <span>FAQ</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Frequently Asked Questions</h1>
            <p className="text-xs text-gray-500">DUDBC rates, BOQ, pricing, and getting started.</p>
          </div>
        </div>

        {/* ── FAQ Content ── */}
        <section className="py-16 sm:py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <FaqAccordion categories={FAQ_CATEGORIES} />
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 px-4 bg-gray-50 border-t border-gray-100">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">
              Still have questions?
            </h2>
            <p className="text-gray-500 text-base mb-8">
              Our team is happy to help. Reach out by email or WhatsApp — we typically respond within one business day.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition"
              >
                Email Us
              </a>
              <a
                href={`https://wa.me/${contactWa.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-400 text-white rounded-xl font-semibold text-sm transition"
              >
                WhatsApp Us
              </a>
            </div>
            <p className="text-gray-500 text-sm">
              Ready to try it yourself?{" "}
              <Link href="/register" className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2">
                Start your free 14-day trial
              </Link>{" "}
              — no credit card required.
            </p>
          </div>
        </section>

        <PublicFooter cfg={cfg} />
      </div>
    </>
  );
}
