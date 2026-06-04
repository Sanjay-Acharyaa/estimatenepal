"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-bold text-gray-200 mb-4">500</p>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-8">
          An unexpected error occurred. Try again or contact support if the problem persists.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 transition"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="border border-gray-300 text-gray-600 text-sm px-5 py-2.5 rounded-lg hover:bg-gray-100 transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
