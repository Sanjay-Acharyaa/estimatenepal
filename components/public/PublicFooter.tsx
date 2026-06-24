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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Logo size={28} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
            <p className="text-xs text-gray-500 mt-3 leading-relaxed max-w-xs">
              Nepal&apos;s construction estimating platform — BOQ, DUDBC rates, drawing takeoff, and tender documents in one place.
            </p>
            {/* Registration placeholder — update when registered */}
            {/* <p className="text-xs text-gray-400 mt-3">Reg. No: [Company Reg No]</p> */}
            {/* <p className="text-xs text-gray-400">PAN: [PAN No]</p> */}
            {/* <p className="text-xs text-gray-400">Kathmandu, Nepal</p> */}
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Product</h4>
            <ul className="space-y-2.5">
              <li><Link href="/#pricing" className="text-sm text-gray-500 hover:text-gray-900 transition">Pricing</Link></li>
              <li><Link href="/faq" className="text-sm text-gray-500 hover:text-gray-900 transition">FAQ</Link></li>
              <li><Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition">Sign In</Link></li>
              <li><Link href="/register" className="text-sm text-gray-500 hover:text-gray-900 transition">Start Free Trial</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Company</h4>
            <ul className="space-y-2.5">
              <li><Link href="/about" className="text-sm text-gray-500 hover:text-gray-900 transition">About Us</Link></li>
              <li><Link href="/contact" className="text-sm text-gray-500 hover:text-gray-900 transition">Contact</Link></li>
              <li><Link href="/security" className="text-sm text-gray-500 hover:text-gray-900 transition">Security</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Legal</h4>
            <ul className="space-y-2.5">
              <li><Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition">Terms of Service</Link></li>
              <li><Link href="/refund" className="text-sm text-gray-500 hover:text-gray-900 transition">Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">© {year} Estimate Nepal. All rights reserved.</p>
          <a href={`mailto:${contactEmail}`} className="text-xs text-gray-400 hover:text-gray-600 transition">{contactEmail}</a>
        </div>
      </div>
    </footer>
  );
}
