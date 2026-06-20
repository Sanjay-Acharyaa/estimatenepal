import { getSession } from "@/lib/auth";
import { getConfig, getConfigBool } from "@/lib/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { NotificationBell } from "@/components/ui/NotificationBell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const siteAnnouncement = await getConfig("site_announcement");

  // Trial banner: show when <= 5 days remain and trial hasn't yet expired
  // (middleware redirects to /trial-expired when it's actually past)
  let trialBanner: { daysLeft: number; contactEmail: string; contactWa: string; waMsg: string } | null = null;
  if (!session.user.isSuperAdmin && session.user.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(session.user.trialEndsAt).getTime() - Date.now()) / 86400000
    );
    if (daysLeft >= 0 && daysLeft <= 5) {
      const [contactEmail, contactWa, waMsg] = await Promise.all([
        getConfig("contact_email"),
        getConfig("contact_whatsapp"),
        getConfig("whatsapp_message"),
      ]);
      trialBanner = { daysLeft, contactEmail, contactWa, waMsg: encodeURIComponent(waMsg) };
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile guard — app requires desktop viewport */}
      <div className="lg:hidden fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="text-5xl mb-4">🖥️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Desktop Required</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          NepaliEstimate is a professional estimation tool designed for desktop use.
          Please open it on a screen at least 1280px wide for the best experience.
        </p>
      </div>
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <Link href="/dashboard">
            <span className="font-bold text-lg text-blue-700 hover:text-blue-800">NepaliEstimate</span>
          </Link>
          <NotificationBell />
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 font-medium"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/projects"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Projects
          </Link>
          <Link
            href="/dashboard/bid-board"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Bid Board
          </Link>
          <Link
            href="/dashboard/rates"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Rate Catalog
          </Link>
          <Link
            href="/dashboard/assemblies"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Assembly Library
          </Link>
          {session.user.isSuperAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 font-medium"
            >
              Super Admin
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-0.5 truncate">{session.user.name}</div>
          <div className="text-xs text-gray-600 mb-1 truncate">{session.user.email}</div>
          <div className="text-xs text-gray-600 mb-2">{session.user.role}</div>
          <Link href="/dashboard/settings" className="block text-xs text-blue-600 hover:underline mb-3">Settings</Link>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col">
        {siteAnnouncement && (
          <div className="flex-shrink-0 bg-blue-600 text-white text-center py-2 px-4 text-sm font-medium">
            {siteAnnouncement}
          </div>
        )}
        {trialBanner !== null && (
          <div className={`flex-shrink-0 px-4 py-2.5 text-sm text-center flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${trialBanner.daysLeft === 0 ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
            <span className="font-semibold">
              {trialBanner.daysLeft === 0
                ? "Your trial expires today!"
                : `Trial ends in ${trialBanner.daysLeft} day${trialBanner.daysLeft === 1 ? "" : "s"}.`}
            </span>
            <span className="opacity-80">Upgrade to keep access to all your projects.</span>
            <a
              href={`https://wa.me/${trialBanner.contactWa.replace(/\D/g, "")}?text=${trialBanner.waMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold hover:opacity-80"
            >
              WhatsApp us
            </a>
            <span className="opacity-60">or</span>
            <a href={`mailto:${trialBanner.contactEmail}`} className="underline font-bold hover:opacity-80">
              {trialBanner.contactEmail}
            </a>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
