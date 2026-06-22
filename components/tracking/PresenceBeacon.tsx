"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const PING_INTERVAL = 2 * 60 * 1000; // ping every 2 minutes

export function PresenceBeacon() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    function ping(path: string) {
      // sendBeacon works even when the tab is being closed
      navigator.sendBeacon(
        "/api/user/presence",
        new Blob([JSON.stringify({ path })], { type: "application/json" })
      );
    }

    // Ping immediately on mount and on path changes
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      ping(pathname);
    }

    // Keep-alive ping every 2 minutes
    const interval = setInterval(() => ping(pathname), PING_INTERVAL);
    return () => clearInterval(interval);
  }, [pathname]);

  return null;
}
