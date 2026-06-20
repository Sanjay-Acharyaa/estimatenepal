"use client";

import { useState } from "react";

interface DashboardShellProps {
  sidebar: React.ReactNode;
  announcement: React.ReactNode;
  trialBanner: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({ sidebar, announcement, trialBanner, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on lg+, slide-in on smaller screens */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {sidebar}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Mobile header bar with hamburger */}
        <div className="lg:hidden flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-blue-700 text-sm">NepaliEstimate</span>
        </div>

        {announcement}
        {trialBanner}
        {children}
      </main>
    </div>
  );
}
