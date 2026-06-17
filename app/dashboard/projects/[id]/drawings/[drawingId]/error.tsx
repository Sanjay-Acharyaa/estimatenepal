"use client";

import { useEffect } from "react";

export default function DrawingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Drawing page error:", error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-gray-300">
      <div className="text-center max-w-md px-6">
        <p className="text-lg font-semibold mb-2">Could not load drawing</p>
        <p className="text-sm text-gray-500 mb-6">
          {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
