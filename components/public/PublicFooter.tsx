import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  cfg: Record<string, string>;
}

export function PublicFooter({ cfg }: Props) {
  const contactEmail = cfg.contact_email || "hello@estimatenepal.com";
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">

        {/* Single row: logo + all link groups inline */}
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3 mb-3">
          <Link href="/" aria-label="Estimate Nepal home" className="shrink-0 mt-0.5">
            <Logo size={22} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
          </Link>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Product</span>
            <div className="flex gap-3 flex-wrap">
              {[["/#pricing","Pricing"],["/faq","FAQ"],["/login","Sign In"],["/register","Free Trial"]].map(([h,l]) => (
                <Link key={h} href={h} className="text-[11px] text-gray-500 hover:text-gray-900 transition">{l}</Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Company</span>
            <div className="flex gap-3 flex-wrap">
              {[["/about","About"],["/contact","Contact"],["/security","Security"]].map(([h,l]) => (
                <Link key={h} href={h} className="text-[11px] text-gray-500 hover:text-gray-900 transition">{l}</Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Legal</span>
            <div className="flex gap-3 flex-wrap">
              {[["/privacy","Privacy"],["/terms","Terms"],["/refund","Refund"]].map(([h,l]) => (
                <Link key={h} href={h} className="text-[11px] text-gray-500 hover:text-gray-900 transition">{l}</Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 pt-3 flex flex-col sm:flex-row items-center justify-between gap-1">
          <p className="text-[10px] text-gray-400">© {year} Estimate Nepal. All rights reserved.</p>
          <a href={`mailto:${contactEmail}`} className="text-[10px] text-gray-400 hover:text-gray-600 transition">{contactEmail}</a>
        </div>
      </div>
    </footer>
  );
}
