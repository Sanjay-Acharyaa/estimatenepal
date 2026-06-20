"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function CouponForm() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error?.message ?? "Failed to apply coupon. Please try again.");
        return;
      }

      setSuccess(data.message);
      // Re-authenticate so the JWT picks up the new trialEndsAt
      setTimeout(() => signOut({ callbackUrl: "/login?coupon=redeemed" }), 2000);
    } catch {
      setLoading(false);
      setError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <>
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-gray-400 uppercase tracking-wide">
            Already have an access code?
          </span>
        </div>
      </div>

      {!success ? (
        <form onSubmit={handleRedeem} className="space-y-3" noValidate>
          <label htmlFor="coupon-code" className="block text-sm font-medium text-gray-700 text-left">
            Enter coupon code
          </label>
          <input
            id="coupon-code"
            type="text"
            required
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
            placeholder="NE-XXXX-XXXX"
            aria-label="Access coupon code"
            aria-invalid={!!error}
            className={`w-full border rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 transition ${
              error ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-blue-500"
            }`}
          />
          {error && <p role="alert" className="text-xs text-red-600 text-left">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? "Applying…" : "Apply Code"}
          </button>
        </form>
      ) : (
        <div role="status" className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm">
          <div className="text-2xl mb-2">✓</div>
          <p className="font-semibold mb-1">Code applied!</p>
          <p className="text-green-600">{success}</p>
          <p className="text-xs text-green-500 mt-2">Signing you out and back in…</p>
        </div>
      )}
    </>
  );
}
