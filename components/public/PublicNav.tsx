import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  cfg: Record<string, string>;
}

export function PublicNav({ cfg }: Props) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link href="/">
          <Logo size={32} name={cfg.site_name || "Estimate Nepal"} src={cfg.site_logo_url || null} />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">About</Link>
          <Link href="/contact" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium hidden sm:block">Contact</Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 transition font-medium">Sign In</Link>
          <Link href="/register" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition">
            Start Free Trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
