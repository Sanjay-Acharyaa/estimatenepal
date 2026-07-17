"use client";

import { useState } from "react";

export function UserTestToggle({ userId, initial }: { userId: string; initial: boolean }) {
  const [isTest, setIsTest] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTestAccount: !isTest }),
      });
      if (res.ok) setIsTest(v => !v);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isTest ? "Mark as real account" : "Mark as test account"}
      className={`ml-1 px-1.5 py-0.5 text-xs rounded border transition disabled:opacity-50 ${
        isTest
          ? "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"
          : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-600"
      }`}
    >
      {loading ? "…" : isTest ? "TEST ✕" : "Set TEST"}
    </button>
  );
}
