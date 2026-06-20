"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

function passwordStrength(p: string): { score: number; label: string; color: string } {
  if (!p) return { score: 0, label: "", color: "" };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-red-400" };
  if (score <= 2) return { score, label: "Fair", color: "bg-amber-400" };
  if (score <= 3) return { score, label: "Good", color: "bg-yellow-400" };
  return { score, label: "Strong", color: "bg-green-500" };
}

function fieldCls(valid: boolean | null) {
  const base = "w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition";
  if (valid === null) return `${base} border-gray-300 focus:ring-blue-500`;
  return valid
    ? `${base} border-green-400 focus:ring-green-400`
    : `${base} border-red-400 focus:ring-red-400`;
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setTouched((t) => ({ ...t, [e.target.name]: true }));
  }

  const validations = {
    name: form.name.trim().length >= 2,
    orgName: form.orgName.trim().length >= 2,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email),
    password: form.password.length >= 8 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password),
  };

  const strength = passwordStrength(form.password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, orgName: true, email: true, password: true });
    if (!Object.values(validations).every(Boolean)) return;
    setError("");
    setSuccess("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error?.message ?? "Registration failed.");
    } else {
      setSuccess(data.message);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — future vision */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 flex-col justify-between p-12 overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 bg-indigo-400/15 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <Logo white size={36} />
        </div>

        {/* Hero */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          {/* Construction lifecycle */}
          <div className="flex items-center gap-2 mb-8">
            {["Estimate", "Bid", "Award", "Build"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{i + 1}</span>
                  </div>
                  <span className="text-blue-200 text-xs mt-1 font-medium">{step}</span>
                </div>
                {i < 3 && <div className="w-8 h-px bg-white/20 mb-4" />}
              </div>
            ))}
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-5">
            Nepal&apos;s Complete<br />
            <span className="text-blue-300">Construction</span><br />
            Marketplace
          </h1>
          <p className="text-blue-200 text-lg mb-10 max-w-sm leading-relaxed">
            From quantity takeoff to contractor selection — manage every phase of your construction project in one platform.
          </p>

          <div className="space-y-4">
            {[
              { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", label: "Upload drawings, generate BOQs instantly" },
              { icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", label: "Publish tenders, receive contractor bids" },
              { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", label: "Compare bids, award contracts transparently" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/15">
                  <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                </div>
                <span className="text-blue-100 text-sm">{label}</span>
              </div>
            ))}
          </div>

          {/* Trial badge */}
          <div className="mt-10 inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 rounded-full px-4 py-2 w-fit">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-amber-200 text-sm font-medium">14-day free trial — no credit card required</span>
          </div>
        </div>

        <div className="relative z-10 text-blue-300/50 text-xs">
          Trusted by construction professionals across Nepal
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center bg-white px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Logo size={32} />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your workspace</h2>
          <p className="text-gray-500 text-sm mb-2">Get started free — set up takes under 2 minutes</p>

          {/* Trial badge — mobile */}
          <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            14-day free trial · No credit card
          </div>

          {error && (
            <div role="alert" className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              {error}
            </div>
          )}

          {success ? (
            <div role="status" className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              <div className="flex items-center gap-2 font-medium mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Account created!
              </div>
              {success}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-label="Create account form">
              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input id="reg-name" name="name" type="text" required autoComplete="name"
                  value={form.name} onChange={handleChange}
                  aria-label="Full name" aria-invalid={touched.name && !validations.name}
                  className={fieldCls(touched.name ? validations.name : null)}
                  placeholder="Ramesh Sharma" />
                {touched.name && !validations.name && (
                  <p className="text-xs text-red-500 mt-1" role="alert">At least 2 characters required.</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-org" className="block text-sm font-medium text-gray-700 mb-1.5">Company / Organisation</label>
                <input id="reg-org" name="orgName" type="text" required autoComplete="organization"
                  value={form.orgName} onChange={handleChange}
                  aria-label="Company or organisation name" aria-invalid={touched.orgName && !validations.orgName}
                  className={fieldCls(touched.orgName ? validations.orgName : null)}
                  placeholder="Sharma Construction Pvt. Ltd." />
                {touched.orgName && !validations.orgName && (
                  <p className="text-xs text-red-500 mt-1" role="alert">At least 2 characters required.</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1.5">Work Email</label>
                <input id="reg-email" name="email" type="email" required autoComplete="email"
                  value={form.email} onChange={handleChange}
                  aria-label="Email address" aria-invalid={touched.email && !validations.email}
                  className={fieldCls(touched.email ? validations.email : null)}
                  placeholder="you@example.com" />
                {touched.email && !validations.email && (
                  <p className="text-xs text-red-500 mt-1" role="alert">Enter a valid email address.</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input id="reg-password" name="password" type="password" required autoComplete="new-password"
                  value={form.password} onChange={handleChange}
                  aria-label="Password" aria-describedby="password-hint"
                  aria-invalid={touched.password && !validations.password}
                  className={fieldCls(touched.password ? validations.password : null)}
                  placeholder="Min 8 chars, 1 uppercase, 1 number" />
                {form.password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1" aria-hidden>
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${strength.score >= i ? strength.color : "bg-gray-200"}`} />
                      ))}
                    </div>
                    {strength.label && <p className="text-xs text-gray-500">Strength: <span className="font-medium">{strength.label}</span></p>}
                  </div>
                )}
                <p id="password-hint" className="text-xs text-gray-400 mt-1">8+ characters, one uppercase, one number.</p>
                {touched.password && !validations.password && (
                  <p className="text-xs text-red-500 mt-1" role="alert">Password must be 8+ chars with uppercase and a number.</p>
                )}
              </div>

              <button type="submit" disabled={loading} aria-busy={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm mt-2">
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creating workspace…
                  </>
                ) : "Create Free Account"}
              </button>

              <p className="text-xs text-gray-400 text-center">
                By creating an account you agree to our terms of service.
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
