"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";

const PLAN_DETAILS: Record<string, { name: string; price: string; tier: string }> = {
  "solo-pro": { name: "Solo Pro", price: "NPR 1,499/month", tier: "Solo Pro" },
  "team-3":   { name: "Team of 3", price: "NPR 3,499/month", tier: "Team of 3" },
  "team-5":   { name: "Team of 5", price: "NPR 5,499/month", tier: "Team of 5" },
};

function CheckoutContent() {
  const params = useSearchParams();
  const planKey = params.get("plan") ?? "solo-pro";
  const plan = PLAN_DETAILS[planKey] ?? PLAN_DETAILS["solo-pro"];
  const [email, setEmail] = useState("");

  const waNumber = "9779800000000"; // TODO: replace with real WhatsApp number
  const waMessage = encodeURIComponent(
    `Hi, I have paid for the ${plan.name} plan (${plan.price}) on EstimateNepal.\nMy registered email: ${email || "[your email]"}\nAttaching payment screenshot.`
  );
  const waLink = `https://wa.me/${waNumber}?text=${waMessage}`;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <div className="mb-6">
          <Link href="/#pricing" className="text-blue-600 hover:underline text-sm">
            ← Back to Pricing
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Complete your payment</h1>
        <p className="text-gray-500 text-sm mb-6">
          You are subscribing to{" "}
          <span className="font-semibold text-gray-800">{plan.name}</span> —{" "}
          <span className="text-blue-600 font-semibold">{plan.price}</span>
        </p>

        {/* QR Code */}
        <div className="flex flex-col items-center mb-6">
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 w-56 h-56 flex items-center justify-center bg-gray-50">
            <Image
              src="/payment-qr.png"
              alt="Payment QR Code"
              width={200}
              height={200}
              className="rounded-lg object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent) parent.innerHTML = '<p class="text-gray-400 text-sm text-center">QR code coming soon</p>';
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Scan to pay via eSewa / Khalti / Bank</p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">How to activate your account:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Scan the QR code and send payment</li>
            <li>Enter your registered email below</li>
            <li>Click "Notify on WhatsApp" and send us your payment screenshot</li>
            <li>We will activate your account within a few hours</li>
          </ol>
        </div>

        {/* Email input for WA pre-fill */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your registered email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition mb-3"
        >
          Notify on WhatsApp
        </a>

        <p className="text-center text-xs text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>{" "}
          · New user?{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            Register first
          </Link>
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
