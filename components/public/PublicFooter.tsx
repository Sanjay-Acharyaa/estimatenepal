import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  cfg: Record<string, string>;
}

const NAV_LINKS = [
  { href: "/#pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refund" },
];

export function PublicFooter({ cfg }: Props) {
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Top row: logo + links */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <Link href="/" aria-label="Estimate Nepal home">
            <Logo size={24} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-xs text-gray-500 hover:text-gray-900 transition">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom row: copyright + email */}
        <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">© {year} Estimate Nepal. All rights reserved.</p>
          <a href={`mailto:${contactEmail}`} className="text-xs text-gray-400 hover:text-gray-600 transition">
            {contactEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
