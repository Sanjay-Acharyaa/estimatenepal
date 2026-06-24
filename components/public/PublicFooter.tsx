import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  cfg: Record<string, string>;
}

const TRUST_LINKS = [
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[45px] flex items-center justify-between gap-4">
        <p className="text-[11px] text-gray-400 shrink-0">© {year} Estimate Nepal</p>

        <nav className="flex items-center gap-4 flex-wrap justify-center">
          {TRUST_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[11px] text-gray-500 hover:text-gray-900 transition">
              {l.label}
            </Link>
          ))}
        </nav>

        <a href={`mailto:${contactEmail}`} className="text-[11px] text-gray-400 hover:text-gray-600 transition shrink-0 hidden sm:block">
          {contactEmail}
        </a>
      </div>
    </footer>
  );
}
