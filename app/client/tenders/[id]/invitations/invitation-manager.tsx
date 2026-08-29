"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvitationManager({ tenderId }: { tenderId: number }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractor_email: trimmed }),
      });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.message ?? "Failed to send invitation." });
      } else {
        setResult({ ok: true, message: `Invitation sent to ${trimmed}.` });
        setEmail("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Invite a contractor by email</h2>
      <p className="text-xs text-gray-500 mb-3">
        The contractor will receive an email with a link to view and accept the invitation. If they are not yet registered on EstimateNepal, they can register and then accept.
      </p>
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contractor@example.com"
          required
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send invite"}
        </button>
      </form>
      {result && (
        <p className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
