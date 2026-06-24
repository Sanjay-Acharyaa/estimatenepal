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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" aria-label="Estimate Nepal home">
              <Logo size={26} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
            </Link>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-xs">
              Nepal&apos;s construction estimating platform — BOQ, DUDBC rates, drawing takeoff, and tender documents in one place.
            </p>
            {/* <p className="text-xs text-gray-400 mt-2">Reg. No: [TBD]</p> */}
            {/* <p className="text-xs text-gray-400">PAN: [TBD]</p> */}
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Product</h4>
            <ul className="space-y-2">
              <li><Link href="/#pricing" className="text-xs text-gray-500 hover:text-gray-900 transition">Pricing</Link></li>
              <li><Link href="/faq" className="text-xs text-gray-500 hover:text-gray-900 transition">FAQ</Link></li>
              <li><Link href="/login" className="text-xs text-gray-500 hover:text-gray-900 transition">Sign In</Link></li>
              <li><Link href="/register" className="text-xs text-gray-500 hover:text-gray-900 transition">Start Free Trial</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-xs text-gray-500 hover:text-gray-900 transition">About Us</Link></li>
              <li><Link href="/contact" className="text-xs text-gray-500 hover:text-gray-900 transition">Contact</Link></li>
              <li><Link href="/security" className="text-xs text-gray-500 hover:text-gray-900 transition">Security</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-900 transition">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-xs text-gray-500 hover:text-gray-900 transition">Terms of Service</Link></li>
              <li><Link href="/refund" className="text-xs text-gray-500 hover:text-gray-900 transition">Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">© {year} Estimate Nepal. All rights reserved.</p>
          <a href={`mailto:${contactEmail}`} className="text-xs text-gray-400 hover:text-gray-600 transition">{contactEmail}</a>
        </div>
      </div>
    </footer>
  );
}
