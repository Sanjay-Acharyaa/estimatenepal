import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { NotificationBell } from "@/components/ui/NotificationBell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

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
          <div className="text-xs text-gray-400 mb-1 truncate">{session.user.email}</div>
          <div className="text-xs text-gray-400 mb-2">{session.user.role}</div>
          <Link href="/dashboard/settings" className="block text-xs text-blue-600 hover:underline mb-3">Settings</Link>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
