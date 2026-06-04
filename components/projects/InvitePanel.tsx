"use client";

import { useState } from "react";

interface Props {
  projectId: string;
}

export function InvitePanel({ projectId: _ }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const send = async () => {
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email."); return; }
    setSending(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/orgs/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed to send invite."); return; }
      setSuccess(`Invitation sent to ${email}.`);
      setEmail("");
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-3 text-sm">Invite Team Member</h3>
      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="colleague@email.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <select
            value={role}
            onChange={e => setRole(e.target.value as "MEMBER" | "ADMIN")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button
            onClick={send}
            disabled={sending}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Invite"}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        {success && <p className="text-green-600 text-xs">{success}</p>}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Invitations expire after 72 hours. The recipient will receive an email with a link to join.
      </p>
    </div>
  );
}
