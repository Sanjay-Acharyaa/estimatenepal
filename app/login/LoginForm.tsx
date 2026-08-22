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
  const [showPassword, setShowPassword] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const verified = params.get("verified");
  const couponRedeemed = params.get("coupon") === "redeemed";
  const rawCallback = params.get("callbackUrl") ?? "";
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/dashboard";

  async function handleResend() {
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // best-effort
    }
    setResendState("sent");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setResendState("idle");
    setLoading(true);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000)
      );
      const res = await Promise.race([
        signIn("credentials", { email, password, redirect: false }),
        timeout,
      ]);
      if (res?.error) {
        if (res.error === "EMAIL_NOT_VERIFIED") {
          setError("Please verify your email before signing in. Check your inbox or resend the link below.");
          setShowResend(true);
        } else {
          setError("Incorrect email or password. If you forgot your password, use the 'Forgot password?' link above.");
          setShowResend(false);
        }
      } else {
        router.push(callbackUrl);
      }
    } catch (err: any) {
      if (err?.message === "timeout") {
        setError("Login is taking longer than usual — the server may be busy. Please try again in a moment.");
      } else {
        setError("Connection error — please check your internet and try again.");
      }
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
          <Link href="/"><Logo white size={36} src={logoUrl || null} name={siteName} /></Link>
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
            <Link href="/"><Logo size={32} src={logoUrl || null} name={siteName} /></Link>
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
          {showResend && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              {resendState === "sent" ? (
                <p className="text-green-700 font-medium">Verification email sent — check your inbox.</p>
              ) : (
                <>
                  <p className="text-amber-800 mb-2 font-medium">Didn&apos;t receive a verification email?</p>
                  <button type="button" onClick={handleResend} disabled={resendState === "sending"}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 font-medium">
                    {resendState === "sending" ? "Sending…" : "Resend verification email"}
                  </button>
                </>
              )}
            </div>
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
              <div className="relative">
                <input id="login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} aria-label="Password"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
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
