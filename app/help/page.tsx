import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Guide — Estimate Nepal",
  description: "Step-by-step guide to using Estimate Nepal — projects, drawings, takeoff, BOQ, rates, and more.",
};

const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    steps: [
      {
        heading: "1. Create your account",
        body: "Go to the Register page, enter your name, email, and password. You will receive a verification email — click the link inside to activate your account.",
      },
      {
        heading: "2. Log in",
        body: "Once verified, log in with your email and password. You will land on the Dashboard.",
      },
      {
        heading: "3. Create your first project",
        body: "Click Projects in the sidebar, then New Project. Fill in the project name, client name, district, seismic zone, and tax settings (VAT 13%, TDS 1.5%). Click Create Project.",
      },
      {
        heading: "4. Start estimating",
        body: "Inside your project you will find Disciplines, Takeoff Groups, Drawings, BOQ, and more. Follow the sections below to understand each part.",
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    steps: [
      {
        heading: "What is a project?",
        body: "A project represents one construction job — a house, a road section, a building tender. All your drawings, measurements, rates, and BOQ live inside the project.",
      },
      {
        heading: "Creating a project",
        body: "Go to Projects → New Project. Required: Project Name. Optional but recommended: Client Name, District (affects DUDBC district rates), Seismic Zone, Estimated Value, Bid Due Date, VAT/TDS settings.",
      },
      {
        heading: "Project settings",
        body: "After creating a project you can edit its settings anytime from the Project → Edit page. You can change the unit system (Metric or Imperial), date format (AD or BS), and tax rates.",
      },
      {
        heading: "Disciplines",
        body: "Inside a project, work is organized by Disciplines (e.g., Civil, Electrical, Plumbing). Each discipline contains Takeoff Groups which hold your individual measurement items.",
      },
      {
        heading: "Free plan limit",
        body: "The Free plan allows 1 project. To create more projects, upgrade to Solo Pro or Team plan from the Pricing page.",
      },
    ],
  },
  {
    id: "drawings",
    title: "Drawings & Takeoff",
    steps: [
      {
        heading: "What is takeoff?",
        body: "Takeoff means measuring quantities directly from your construction drawings — lengths of walls, floor areas, volumes of excavation, number of doors. Estimate Nepal lets you do this on PDF drawings digitally.",
      },
      {
        heading: "Step 1 — Upload a PDF drawing",
        body: "Open your project → Drawings tab → Upload Drawing. Select a PDF file. Each page of the PDF becomes a separate drawing page. Large PDFs with many pages may take a moment to process.",
      },
      {
        heading: "Step 2 — Set the scale",
        body: "Before measuring, you must set the scale so the software knows what 1 pixel equals in the real world. Click Set Scale on the drawing page. Click two points on the drawing whose real distance you know (e.g., the ends of a 5-metre gridline), then enter the actual distance. The scale is saved per page.",
      },
      {
        heading: "Step 3 — Measure",
        body: "Select a measurement type from the toolbar: Length (e.g., pipework, wall perimeter), Area (e.g., floor slab, plaster), Volume (e.g., excavation, concrete — area × depth), or Count (e.g., number of columns, doors). Click on the drawing to trace the shape. The quantity is calculated automatically.",
      },
      {
        heading: "Step 4 — Assign to a takeoff group",
        body: "Each measurement is linked to a Takeoff Group inside a Discipline. Select the correct group from the dropdown when placing a measurement. This groups your quantities by work type for the BOQ.",
      },
      {
        heading: "Multiple pages",
        body: "A drawing with multiple pages (e.g., ground floor plan, first floor plan) shows each page separately. Set the scale on each page independently if the scales differ.",
      },
    ],
  },
  {
    id: "rates",
    title: "Rate Catalog",
    steps: [
      {
        heading: "What is the Rate Catalog?",
        body: "The Rate Catalog is your library of unit rates — how much it costs per m², per m³, per kg, per unit — for every type of work. Rates are used to price the quantities measured in takeoff.",
      },
      {
        heading: "DUDBC rates",
        body: "Estimate Nepal comes with official DUDBC (Department of Urban Development and Building Construction) rates pre-loaded by the admin. These cover labour, material, and equipment for standard construction work across all 77 districts of Nepal.",
      },
      {
        heading: "District rates",
        body: "DUDBC publishes adjusted rates per district to account for material transport and local labour costs. When you select a district in your project settings, the correct district rates are applied automatically to DUDBC items.",
      },
      {
        heading: "Adding custom rates",
        body: "Go to Rate Catalog → Add Rate. Enter the item name, unit (m, m², m³, kg, pcs, etc.), and unit rate in NPR. Custom rates can be used alongside DUDBC rates in any project.",
      },
      {
        heading: "Rate analysis",
        body: "Each DUDBC rate has a full cost breakdown — labour component, material component, equipment component, contingency, and VAT. Click on a rate to view its analysis sheet.",
      },
    ],
  },
  {
    id: "assemblies",
    title: "Assembly Library",
    steps: [
      {
        heading: "What is an Assembly?",
        body: "An Assembly is a pre-built group of takeoff items for a standard scope of work. For example, a 'Brick Masonry Wall' assembly might contain: wall area (m²), plaster both sides (m²), and curing (m²) — all in one template.",
      },
      {
        heading: "Why use assemblies?",
        body: "Assemblies save time on repeat projects. Instead of setting up the same takeoff groups from scratch every time you estimate a building, you apply the assembly and all the standard items are added instantly.",
      },
      {
        heading: "Applying an assembly to a project",
        body: "Inside your project → Disciplines → click Apply Assembly. Select the assembly from the list. All the takeoff groups and items from the assembly are added to your project with their linked rates.",
      },
      {
        heading: "Creating an assembly",
        body: "Go to Assembly Library → New Assembly. Add the name and description, then add the takeoff groups and items you want included. Save it and it will be available to apply to any future project.",
      },
      {
        heading: "Project Templates",
        body: "When creating a new project, you can also select a Project Template which pre-loads both disciplines and assemblies for a standard project type (e.g., Residential, Road, Drainage).",
      },
    ],
  },
  {
    id: "boq",
    title: "Bill of Quantities (BOQ)",
    steps: [
      {
        heading: "What is the BOQ?",
        body: "The Bill of Quantities is the final priced list of all work items — quantities from your takeoff multiplied by unit rates from the Rate Catalog. It is the official document used for tendering in Nepal.",
      },
      {
        heading: "How is the BOQ generated?",
        body: "The BOQ is generated automatically from your takeoff measurements and linked rates. When you measure 50 m² of floor slab in takeoff and the rate is NPR 5,500/m², the BOQ shows: Floor Slab — 50 m² — NPR 5,500 — Total NPR 2,75,000.",
      },
      {
        heading: "Overriding quantities",
        body: "If you need to adjust a quantity (e.g., add a buffer or use a manually counted figure), you can override the auto-calculated quantity in the BOQ. The override is highlighted so it is clear which items have been manually adjusted.",
      },
      {
        heading: "VAT and TDS",
        body: "VAT (13%) and TDS (1.5%) are applied at the totals level based on your project settings. They appear clearly at the bottom of the BOQ before the grand total.",
      },
      {
        heading: "Exporting the BOQ",
        body: "Click Export in the BOQ view to download: PDF BOQ (for client submission), Excel BOQ (for editing), MB Book (Measurement Book format), Tender Bundle (full document set), or Procurement List (materials only).",
      },
      {
        heading: "Change Orders",
        body: "After a project is tendered, any changes to scope are recorded as Change Orders. Go to Project → Change Orders to add, track, and export approved changes.",
      },
    ],
  },
  {
    id: "bid-board",
    title: "Bid Board",
    steps: [
      {
        heading: "What is the Bid Board?",
        body: "The Bid Board gives you a single view of all your active bids — project name, client, estimated value, bid due date, and current status. It is designed for estimators who are working on multiple tenders at the same time.",
      },
      {
        heading: "Bid statuses",
        body: "Each project on the Bid Board has a status: Estimating, Submitted, Won, or Lost. Update the status as the bid progresses so your board stays accurate.",
      },
      {
        heading: "Due date tracking",
        body: "Projects with upcoming bid due dates are highlighted so you can prioritize. Set the Bid Due Date when creating or editing a project.",
      },
    ],
  },
  {
    id: "team",
    title: "Team & Collaboration",
    steps: [
      {
        heading: "Inviting team members",
        body: "As the organisation Owner, go to Settings → Organisation → Invite Member. Enter the email address and role (Member or Admin). The person will receive an invitation email with a link to join your organisation.",
      },
      {
        heading: "Roles",
        body: "Owner: full access including billing and team management. Admin: can create and edit all projects and rates. Member: can work on assigned projects.",
      },
      {
        heading: "Live collaboration",
        body: "When multiple team members have the same project open, you can see each other's live cursors on the drawing canvas. Shape locks prevent two people from editing the same takeoff item at the same time.",
      },
      {
        heading: "Team plan limits",
        body: "Solo Pro: 1 user. Team of 3: up to 3 users. Team of 5: up to 5 users. Enterprise: unlimited. Upgrade in Settings → Billing.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Activation",
    steps: [
      {
        heading: "Free plan",
        body: "All new accounts start on the Free plan with 1 project. No credit card required. The free plan has no time limit.",
      },
      {
        heading: "Upgrading",
        body: "To upgrade, go to the Pricing page, choose a plan, and click Pay Now. You will be taken to the Checkout page where you can pay via eSewa or Khalti by scanning the QR code.",
      },
      {
        heading: "How payment works",
        body: "1. Scan the QR and pay the exact amount. 2. Note your transaction ID from eSewa / Khalti. 3. Click Notify on WhatsApp and share your transaction ID. 4. We verify your payment and send you an activation code. 5. Enter the code in Settings → Billing → Activate.",
      },
      {
        heading: "Entering an activation code",
        body: "Go to Dashboard → Settings → Billing tab. Type or paste your activation code in the box and click Activate. Your plan will be upgraded immediately.",
      },
      {
        heading: "Annual billing",
        body: "Choose Annual on the Checkout page to get 2 months free. Annual plans are billed once per year and the price is locked for the duration of your subscription.",
      },
    ],
  },
  {
    id: "exports",
    title: "Exports & Documents",
    steps: [
      {
        heading: "BOQ PDF",
        body: "A professionally formatted Bill of Quantities PDF ready for submission to clients or government offices. Includes project details, item descriptions, quantities, unit rates, amounts, VAT, TDS, and grand total.",
      },
      {
        heading: "BOQ Excel",
        body: "The same BOQ data in Excel format for further editing, sharing, or internal review.",
      },
      {
        heading: "MB Book (Measurement Book)",
        body: "The standard Measurement Book format used in Nepal government projects. Shows each takeoff item with its measurement sketch description, length × breadth × depth, number of units, and total quantity.",
      },
      {
        heading: "Tender Bundle",
        body: "A complete tender document package: BOQ + rate analysis sheets for all items. Ready to submit as a formal bid.",
      },
      {
        heading: "Procurement List",
        body: "A materials-only list extracted from the BOQ — useful for purchasing or subcontractor quoting. Shows material name, quantity, unit, and total estimated cost.",
      },
      {
        heading: "Rate Analysis Sheet",
        body: "For any individual rate item, export a full rate analysis showing the breakdown of labour, material, equipment, overhead, and contingency aligned with DUDBC format.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-blue-600 hover:underline text-sm">← Home</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Help & User Guide</h1>
            <p className="text-gray-500 text-sm mt-0.5">Everything you need to know about using Estimate Nepal</p>
          </div>
          <Link
            href="/dashboard"
            className="hidden sm:inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Go to Dashboard →
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 flex gap-10">

        {/* Sidebar nav */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <nav className="sticky top-8 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sections</p>
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block text-sm text-gray-600 hover:text-blue-600 py-1 transition"
              >
                {s.title}
              </a>
            ))}
            <div className="pt-4 border-t border-gray-200 mt-4">
              <p className="text-xs text-gray-400 mb-2">Need more help?</p>
              <a
                href="/contact"
                className="block text-sm text-blue-600 hover:underline py-0.5"
              >
                Contact us
              </a>
            </div>
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* Quick links on mobile */}
          <div className="lg:hidden flex flex-wrap gap-2">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs bg-white border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 px-3 py-1.5 rounded-full transition"
              >
                {s.title}
              </a>
            ))}
          </div>

          {SECTIONS.map(section => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.steps.map((step, i) => (
                  <details key={i} className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none">
                      <span className="text-sm font-semibold text-gray-800">{step.heading}</span>
                      <svg
                        className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                      {step.body}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          {/* Contact callout */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <p className="text-blue-900 font-semibold mb-1">Still have questions?</p>
            <p className="text-blue-700 text-sm mb-4">
              We are here to help. Reach out via WhatsApp or email and we will respond within a few hours.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                href="/contact"
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
              >
                Contact Us
              </Link>
              <Link
                href="/faq"
                className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-300 text-sm font-semibold px-5 py-2 rounded-lg transition"
              >
                View FAQ
              </Link>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
