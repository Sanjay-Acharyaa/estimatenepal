"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

const PLANS: Record<string, { name: string; monthly: number; annual: number }> = {
  "solo-pro": { name: "Solo Pro",   monthly: 1499,  annual: 14990 },
  "team-3":   { name: "Team of 3",  monthly: 3499,  annual: 34990 },
  "team-5":   { name: "Team of 5",  monthly: 5499,  annual: 54990 },
};

function fmt(n: number) {
  return "NPR " + n.toLocaleString("en-NP");
}

function CheckoutContent() {
  const params = useSearchParams();
  const planKey = params.get("plan") ?? "solo-pro";
  const plan = PLANS[planKey] ?? PLANS["solo-pro"];

  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [waNumber, setWaNumber] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [email, setEmail] = useState("");
  const [txnId, setTxnId] = useState("");

  const price = billing === "annual" ? plan.annual : plan.monthly;
  const saving = billing === "annual" ? plan.monthly * 2 : 0;

  useEffect(() => {
    fetch("/api/config/public")
      .then(r => r.json())
      .then(cfg => {
        setWaNumber((cfg.contactWhatsapp ?? "").replace(/\D/g, ""));
        setQrUrl(cfg.paymentQrUrl ?? "");
      })
      .catch(() => {});
    fetch("/api/auth/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.email) setEmail(d.email); })
      .catch(() => {});
  }, []);

  const waMsg = encodeURIComponent(
    `Hi, I have paid for ${plan.name} (${billing === "annual" ? "Annual" : "Monthly"} — ${fmt(price)}) on EstimateNepal.\nRegistered email: ${email || "[your email]"}\nTransaction ID: ${txnId || "[your txn ID]"}\nPlease send my activation code.`
  );
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${waMsg}` : "#";

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <div className="mb-6">
          <Link href="/#pricing" className="text-blue-600 hover:underline text-sm">
            ← Back to Pricing
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Complete your payment</h1>

        {/* Plan + billing toggle */}
        <div className="mb-6">
          <p className="text-gray-500 text-sm mb-3">
            Plan: <span className="font-semibold text-gray-800">{plan.name}</span>
          </p>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setBilling("monthly")}
              className={`flex-1 py-2 transition ${billing === "monthly" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`flex-1 py-2 transition ${billing === "annual" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Annual
            </button>
          </div>

          <div className="mt-3 text-center">
            <span className="text-3xl font-extrabold text-gray-900">{fmt(price)}</span>
            <span className="text-gray-500 text-sm ml-1">/{billing === "annual" ? "year" : "month"}</span>
            {billing === "annual" && (
              <p className="text-green-600 text-xs mt-1 font-medium">
                You save {fmt(saving)} — 2 months free
              </p>
            )}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center mb-6">
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 w-52 h-52 flex items-center justify-center bg-gray-50">
            {qrUrl ? (
              <Image src={qrUrl} alt="Payment QR" width={200} height={200} className="rounded-lg object-contain" />
            ) : (
              <p className="text-gray-400 text-sm text-center">QR code loading…</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">Scan to pay via eSewa / Khalti / Bank</p>
        </div>

        {/* Email + Txn ID fields */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Your registered email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Transaction ID from eSewa / Khalti <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={txnId}
              onChange={e => setTxnId(e.target.value)}
              placeholder="e.g. 0070ABC12345"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Find this in your eSewa / Khalti payment history.</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6 text-sm text-blue-800 space-y-1">
          <p className="font-semibold mb-2">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Scan QR and pay <strong>{fmt(price)}</strong></li>
            <li>Enter your email and transaction ID above</li>
            <li>Click "Notify on WhatsApp" — message is pre-filled</li>
            <li>We verify and send your activation code within a few hours</li>
            <li>Enter the code in <strong>Dashboard → Settings → Billing</strong></li>
          </ol>
        </div>

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full text-center font-semibold py-3 rounded-xl transition mb-3 ${
            email && txnId
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none"
          }`}
          aria-disabled={!email || !txnId}
        >
          Notify on WhatsApp
        </a>
        {(!email || !txnId) && (
          <p className="text-center text-xs text-amber-600 mb-3">
            Fill in your email and transaction ID above to enable this button.
          </p>
        )}

        <p className="text-center text-xs text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">Log in</Link>
          {" · "}
          New user?{" "}
          <Link href="/register" className="text-blue-600 hover:underline">Register first</Link>
        </p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}
