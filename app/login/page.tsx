"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendLoading(true);
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resendEmail }),
    });
    setResendLoading(false);
    setResendMsg("If this email is registered and unverified, a new verification link has been sent.");
  }

  const verified = params.get("verified");
  // Restrict to same-origin paths only — prevents open redirect via crafted callbackUrl
  const rawCallback = params.get("callbackUrl") ?? "";
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid credentials or unverified account.");
      setShowResend(true);
      setResendEmail(email);
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">NepaliEstimate</h1>
      <p className="text-gray-500 mb-6 text-sm">Sign in to your account</p>

      {verified && (
        <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
          Email verified! You can now log in.
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}
      {showResend && !resendMsg && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
          <p className="text-amber-800 mb-2">Account not verified? Resend the verification email.</p>
          <form onSubmit={handleResend} className="flex gap-2">
            <input
              type="email"
              required
              value={resendEmail}
              onChange={e => setResendEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 border border-amber-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button type="submit" disabled={resendLoading}
              className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50">
              {resendLoading ? "Sending…" : "Resend"}
            </button>
          </form>
        </div>
      )}
      {resendMsg && (
        <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
          {resendMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-blue-600 hover:underline font-medium">Register</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense fallback={<div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center text-gray-600">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
