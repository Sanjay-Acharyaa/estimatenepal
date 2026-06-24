"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem("cookie_consent");
      if (!consent) setShow(true);
    } catch {
      // localStorage not available (incognito strict mode etc.) — don't show banner
    }
  }, []);

  const save = (value: "accepted" | "declined") => {
    try { localStorage.setItem("cookie_consent", value); } catch { /* ignore */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 text-white px-4 sm:px-6 py-4 shadow-2xl"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-300 flex-1">
          We use essential cookies to keep you signed in and remember your preferences. We also use optional analytics
          cookies (Google Analytics) to understand how you use Estimate Nepal and improve the product.{" "}
          <Link href="/privacy#cookies" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            Learn more in our Privacy Policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => save("declined")}
            className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-lg border border-gray-600 hover:border-gray-400 transition"
          >
            Essential Only
          </button>
          <button
            onClick={() => save("accepted")}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-semibold transition"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
