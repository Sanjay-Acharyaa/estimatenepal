import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  cfg: Record<string, string>;
}

const TRUST_LINKS = [
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact Us" },
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refund Policy" },
];

export function PublicFooter({ cfg }: Props) {
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const year = new Date().getFullYear();

  return (
    <footer className="bg-blue-950 border-t border-blue-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[30px] flex items-center justify-between gap-4">
        <p className="text-[11px] text-gray-500 shrink-0">© {year} Estimate Nepal</p>

        <nav className="flex items-center gap-4 flex-wrap justify-center">
          {TRUST_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[11px] text-gray-400 hover:text-white transition">
              {l.label}
            </Link>
          ))}
        </nav>

        <a href={`mailto:${contactEmail}`} className="text-[11px] text-gray-500 hover:text-gray-200 transition shrink-0 hidden sm:block">
          {contactEmail}
        </a>
      </div>
    </footer>
  );
}
