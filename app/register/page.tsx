"use client";

import { useState } from "react";
import Link from "next/link";

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
  if (valid === null) return "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  return valid
    ? "w-full border border-green-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
    : "w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400";
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create account</h1>
        <p className="text-gray-500 mb-6 text-sm">Set up your NepaliEstimate workspace</p>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
            {success}
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-label="Create account form">
            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                id="reg-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                aria-label="Full name"
                aria-invalid={touched.name && !validations.name}
                className={fieldCls(touched.name ? validations.name : null)}
                placeholder="Ramesh Sharma"
              />
              {touched.name && !validations.name && (
                <p className="text-xs text-red-500 mt-0.5" role="alert">At least 2 characters required.</p>
              )}
            </div>

            <div>
              <label htmlFor="reg-org" className="block text-sm font-medium text-gray-700 mb-1">Company / Organisation</label>
              <input
                id="reg-org"
                name="orgName"
                type="text"
                required
                autoComplete="organization"
                value={form.orgName}
                onChange={handleChange}
                aria-label="Company or organisation name"
                aria-invalid={touched.orgName && !validations.orgName}
                className={fieldCls(touched.orgName ? validations.orgName : null)}
                placeholder="Sharma Construction Pvt. Ltd."
              />
              {touched.orgName && !validations.orgName && (
                <p className="text-xs text-red-500 mt-0.5" role="alert">At least 2 characters required.</p>
              )}
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="reg-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                aria-label="Email address"
                aria-invalid={touched.email && !validations.email}
                className={fieldCls(touched.email ? validations.email : null)}
                placeholder="you@example.com"
              />
              {touched.email && !validations.email && (
                <p className="text-xs text-red-500 mt-0.5" role="alert">Enter a valid email address.</p>
              )}
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="reg-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                aria-label="Password"
                aria-describedby="password-hint"
                aria-invalid={touched.password && !validations.password}
                className={fieldCls(touched.password ? validations.password : null)}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
              />
              {form.password && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strength.score >= i ? strength.color : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  {strength.label && (
                    <p className="text-xs text-gray-500">
                      Strength: <span className="font-medium">{strength.label}</span>
                    </p>
                  )}
                </div>
              )}
              <p id="password-hint" className="text-xs text-gray-600 mt-0.5">
                At least 8 characters, one uppercase letter, one number.
              </p>
              {touched.password && !validations.password && (
                <p className="text-xs text-red-500 mt-0.5" role="alert">
                  Password must be 8+ chars with at least one uppercase letter and one number.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
