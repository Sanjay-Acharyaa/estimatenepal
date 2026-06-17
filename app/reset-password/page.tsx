"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error?.message ?? data.error ?? "Something went wrong.");
    } else {
      setMessage(data.message);
      setTimeout(() => router.push("/login"), 2000);
    }
  }

  if (!token) {
    return (
      <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
        <p className="text-red-600">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-blue-600 hover:underline text-sm">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Set new password</h1>
      <p className="text-gray-500 mb-6 text-sm">Enter your new password below.</p>
      {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {message && (
        <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
          {message} Redirecting to login…
        </div>
      )}
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Set new password form">
          <div>
            <label htmlFor="rp-password" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input id="rp-password" type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-label="New password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Min 8 characters" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50">
            {loading ? "Saving..." : "Reset Password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense fallback={<div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center text-gray-600">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
