"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@estimatenepal.com";

export default function TrialExpiredPage() {
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
      // Wait 2s then sign out so the user re-authenticates with the updated trialEndsAt in their JWT
      setTimeout(() => signOut({ callbackUrl: "/login?coupon=redeemed" }), 2000);
    } catch {
      setLoading(false);
      setError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">⏰</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Free Trial Ended</h1>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          Your 3-day free trial has ended. To continue using NepaliEstimate, contact us
          and we will send you an access code.
        </p>

        {/* Contact button */}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=NepaliEstimate%20Access&body=Hi%2C%20I%20would%20like%20to%20continue%20using%20NepaliEstimate.%20Please%20send%20me%20an%20access%20code.`}
          className="block w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition mb-6"
        >
          Contact Us to Get Access →
        </a>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-gray-400 uppercase tracking-wide">
              Already have a code?
            </span>
          </div>
        </div>

        {/* Coupon redemption form */}
        {!success ? (
          <form onSubmit={handleRedeem} className="space-y-3" noValidate>
            <div>
              <label htmlFor="coupon-code" className="sr-only">
                Access coupon code
              </label>
              <input
                id="coupon-code"
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError("");
                }}
                placeholder="NE-XXXX-XXXX"
                aria-label="Access coupon code"
                aria-describedby={error ? "coupon-error" : undefined}
                aria-invalid={!!error}
                className={`w-full border rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 transition ${
                  error
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-blue-500"
                }`}
              />
              {error && (
                <p id="coupon-error" role="alert" className="mt-1.5 text-xs text-red-600">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              aria-busy={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Applying…" : "Apply Code"}
            </button>
          </form>
        ) : (
          <div
            role="status"
            className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm"
          >
            <div className="text-2xl mb-2">✓</div>
            <p className="font-semibold mb-1">Code applied!</p>
            <p className="text-green-600">{success}</p>
            <p className="text-xs text-green-500 mt-2">Signing you out and back in…</p>
          </div>
        )}

        {/* Sign in with different account */}
        <Link
          href="/login"
          className="block mt-6 text-sm text-gray-400 hover:text-gray-600 transition"
        >
          Sign in with a different account
        </Link>
      </div>
    </div>
  );
}
