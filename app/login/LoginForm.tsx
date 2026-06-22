"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

interface Props {
  siteName: string;
  logoUrl: string;
  headline: string;
  subtext: string;
}

export function LoginForm({ siteName, logoUrl, headline, subtext }: Props) {
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

  const verified = params.get("verified");
  const couponRedeemed = params.get("coupon") === "redeemed";
  const rawCallback = params.get("callbackUrl") ?? "";
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/dashboard";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Invalid credentials or unverified email. Check your inbox for the verification link.");
        setShowResend(true);
        setResendEmail(email);
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError("Connection error — please check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT PANEL — Blueprint Aesthetic ── */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative flex-col justify-between p-12 overflow-hidden"
        style={{ backgroundColor: "#0f172a" }}
      >
        {/* Two-level blueprint grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="bp-fine" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(59,130,246,0.06)" strokeWidth="0.5"/>
            </pattern>
            <pattern id="bp-major" width="120" height="120" patternUnits="userSpaceOnUse">
              <rect width="120" height="120" fill="url(#bp-fine)"/>
              <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(59,130,246,0.13)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bp-major)"/>
        </svg>

        {/* Building elevation drawing — right-side decoration */}
        <svg
          className="absolute right-0 top-0 h-full pointer-events-none"
          style={{ width: "210px", opacity: 0.07 }}
          viewBox="0 0 200 720"
          preserveAspectRatio="xMaxYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Centre column construction line */}
          <line x1="100" y1="25" x2="100" y2="670" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="6,4"/>
          {/* Gable roof */}
          <polyline points="20,80 100,28 180,80" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
          <line x1="20" y1="80" x2="180" y2="80" stroke="#60a5fa" strokeWidth="1"/>
          {/* 7 floors */}
          {Array.from({ length: 7 }).map((_, f) => {
            const top = 80 + f * 82;
            return (
              <g key={f}>
                <rect x="20" y={top} width="160" height="82" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
                <rect x="35" y={top + 14} width="30" height="52" fill="none" stroke="#60a5fa" strokeWidth="1"/>
                <rect x="85" y={top + 14} width="30" height="52" fill="none" stroke="#60a5fa" strokeWidth="1"/>
                <rect x="135" y={top + 14} width="30" height="52" fill="none" stroke="#60a5fa" strokeWidth="1"/>
              </g>
            );
          })}
          {/* Foundation slab */}
          <rect x="8" y="654" width="184" height="18" fill="none" stroke="#60a5fa" strokeWidth="2"/>
          {/* Dimension line — left */}
          <line x1="5" y1="80" x2="5" y2="654" stroke="#60a5fa" strokeWidth="0.5"/>
          <line x1="0" y1="80" x2="10" y2="80" stroke="#60a5fa" strokeWidth="0.5"/>
          <line x1="0" y1="654" x2="10" y2="654" stroke="#60a5fa" strokeWidth="0.5"/>
        </svg>

        {/* Nepal mountain silhouette — bottom */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full pointer-events-none"
          style={{ opacity: 0.13 }}
          viewBox="0 0 900 130"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,130 L0,90 L70,55 L130,75 L200,28 L270,58 L340,8 L415,48 L470,26 L540,54 L600,33 L660,58 L720,40 L790,63 L850,46 L900,56 L900,130 Z"
            fill="#3b82f6" opacity="0.5"
          />
          <path
            d="M0,130 L0,102 L80,78 L150,92 L230,66 L300,86 L370,52 L440,77 L500,61 L570,80 L640,57 L710,82 L780,64 L850,82 L900,70 L900,130 Z"
            fill="#1e40af" opacity="0.6"
          />
          {/* Snow caps */}
          <polygon points="333,8 347,8 361,22 352,17 340,22" fill="white" opacity="0.55"/>
          <polygon points="463,26 477,26 489,38 481,33 470,38" fill="white" opacity="0.45"/>
          <polygon points="193,28 207,28 219,40 211,35 200,40" fill="white" opacity="0.45"/>
        </svg>

        {/* Blueprint grid coordinate labels */}
        {["A","B","C","D","E"].map((l, i) => (
          <span key={l} className="absolute top-3 font-mono text-[10px] select-none pointer-events-none"
            style={{ left: `${8 + i * 17}%`, color: "rgba(59,130,246,0.18)" }}>{l}</span>
        ))}
        {["1","2","3","4","5"].map((n, i) => (
          <span key={n} className="absolute left-3 font-mono text-[10px] select-none pointer-events-none"
            style={{ top: `${15 + i * 16}%`, color: "rgba(59,130,246,0.18)" }}>{n}</span>
        ))}

        {/* Logo */}
        <div className="relative z-10">
          <Logo white size={36} src={logoUrl || null} name={siteName} />
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg">

          {/* Blueprint section label */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1" style={{ backgroundColor: "rgba(59,130,246,0.2)" }} />
            <span className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: "rgba(96,165,250,0.45)" }}>
              Construction Platform · Nepal
            </span>
            <div className="h-px w-8" style={{ backgroundColor: "rgba(59,130,246,0.2)" }} />
          </div>

          {/* Headline */}
          <h1 className="text-3xl xl:text-[2.5rem] font-bold text-white leading-tight mb-4">
            {headline}
          </h1>
          <p className="text-base mb-12 leading-relaxed max-w-sm" style={{ color: "rgba(147,197,253,0.6)" }}>
            {subtext}
          </p>

          {/* Process flow — blueprint style */}
          <div className="relative mb-12">
            {/* Dashed connector line */}
            <div className="absolute top-5 left-5 right-16 h-px border-t border-dashed pointer-events-none"
              style={{ borderColor: "rgba(59,130,246,0.22)" }} />
            <div className="flex items-start">
              {(["Estimate", "Bid", "Award", "Build"] as const).map((step, i) => (
                <div key={step} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 mb-2.5"
                    style={{ backgroundColor: "#0f172a", border: "1px solid rgba(59,130,246,0.4)" }}
                  >
                    <span className="font-mono font-bold text-xs" style={{ color: "rgba(147,197,253,0.9)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "rgba(147,197,253,0.6)" }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-6"
            style={{ borderTop: "1px solid rgba(59,130,246,0.1)" }}>
            {[
              { val: "10×", label: "Faster than manual" },
              { val: "50+", label: "Trade categories" },
              { val: "5", label: "Export formats" },
            ].map(({ val, label }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-white font-mono">{val}</div>
                <div className="font-mono text-xs mt-0.5 leading-tight" style={{ color: "rgba(96,165,250,0.45)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Blueprint title block — bottom */}
        <div className="relative z-10 flex items-end justify-between">
          <div className="font-mono text-xs space-y-0.5" style={{ color: "rgba(59,130,246,0.22)", lineHeight: "1.5" }}>
            <div>PROJECT: Estimate Nepal</div>
            <div>SHEET: LOGIN · REV 2.0</div>
          </div>
          <div className="font-mono text-xs text-right" style={{ color: "rgba(59,130,246,0.22)" }}>
            estimatenepal.com
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Form ── */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Logo size={32} src={logoUrl || null} name={siteName} />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-7">Sign in to continue to your workspace</p>

          {verified && (
            <div role="status" className="mb-5 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Email verified! You can now sign in.
            </div>
          )}
          {couponRedeemed && (
            <div role="status" className="mb-5 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Access code applied! Sign in to continue with your extended access.
            </div>
          )}
          {error && (
            <div role="alert" className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              {error}
            </div>
          )}
          {showResend && !resendMsg && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="text-amber-800 mb-2 font-medium">Account not verified?</p>
              <form onSubmit={handleResend} className="flex gap-2">
                <input type="email" required value={resendEmail} onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
                <button type="submit" disabled={resendLoading}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 font-medium">
                  {resendLoading ? "Sending…" : "Resend"}
                </button>
              </form>
            </div>
          )}
          {resendMsg && (
            <div role="status" className="mb-5 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{resendMsg}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <input id="login-email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} aria-label="Email address"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="you@example.com" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Password</label>
                <Link href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 hover:underline">Forgot password?</Link>
              </div>
              <input id="login-password" type="password" required autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} aria-label="Password"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm">
              {loading ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Signing in…</>
              ) : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Create one free</Link>
          </p>
        </div>
      </div>

    </div>
  );
}
