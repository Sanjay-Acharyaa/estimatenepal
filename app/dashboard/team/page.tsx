"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Member = { id: string; name: string; email: string; role: string; emailVerified: boolean; lastLoginAt: string | null };
type Invite = { id: string; email: string; role: string; createdAt: string; expiresAt: string };
type Profile = { id: string; name: string; email: string; role: string };

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function TeamPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteError, setInviteError] = useState("");

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/orgs/members");
      if (!res.ok) throw new Error("Failed to load team");
      const d = await res.json();
      setMembers(d.members ?? []);
      setInvites(d.invites ?? []);
    } catch {
      setLoadError("Failed to load team. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then(r => r.json())
      .then(d => setProfile(d))
      .catch(() => {});
    loadTeam();
  }, [loadTeam]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSending(true);
    setInviteMsg("");
    setInviteError("");
    try {
      const res = await fetch("/api/orgs/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const d = await res.json();
      if (res.ok) {
        setInviteMsg(`Invite sent to ${inviteEmail}.`);
        setInviteEmail("");
        await loadTeam();
      } else {
        setInviteError(d?.error?.message ?? "Failed to send invite.");
      }
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInviteSending(false);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the organisation?`)) return;
    const res = await fetch(`/api/orgs/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      await loadTeam();
    } else {
      const d = await res.json();
      alert(d?.error?.message ?? "Failed to remove member.");
    }
  }

  async function changeRole(userId: string, role: "ADMIN" | "MEMBER") {
    const res = await fetch(`/api/orgs/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      await loadTeam();
    } else {
      const d = await res.json();
      alert(d?.error?.message ?? "Failed to change role.");
    }
  }

  const canManage = ["OWNER", "ADMIN"].includes(profile?.role ?? "");

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-800">Team</h1>
        <button
          onClick={loadTeam}
          className="ml-auto text-xs text-blue-600 hover:text-blue-700"
          aria-label="Refresh team list"
        >
          Refresh
        </button>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {loadError}
        </div>
      )}

      {/* Members */}
      <section className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">Members</h2>
        </div>

        {loading ? (
          <div className="px-5 py-6 flex items-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
            Loading…
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">No members found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 font-semibold text-xs">{m.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                  {m.lastLoginAt && (
                    <p className="text-xs text-gray-400">
                      Last active {new Date(m.lastLoginAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  m.role === "OWNER" ? "bg-purple-100 text-purple-700"
                  : m.role === "ADMIN" ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {m.role}
                </span>
                {!m.emailVerified && (
                  <span className="flex-shrink-0 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Unverified</span>
                )}
                {profile?.role === "OWNER" && m.role !== "OWNER" && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value as "ADMIN" | "MEMBER")}
                      className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label={`Change role for ${m.name}`}
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                    <button
                      onClick={() => removeMember(m.id, m.name)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Pending Invites</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-5 py-3 bg-amber-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-400">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                </div>
                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{inv.role}</span>
                <span className="text-xs text-gray-400">Pending</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite form */}
      {canManage && (
        <section className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Invite a Team Member</h2>
          </div>
          <form onSubmit={sendInvite} className="px-5 py-4 space-y-3">
            <p className="text-xs text-gray-500">
              They will receive an email with a link to join your organisation.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(""); }}
                placeholder="colleague@example.com"
                required
                className={`${inputCls} flex-1`}
                aria-label="Invitee email address"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Invitee role"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                type="submit"
                disabled={inviteSending}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition"
              >
                {inviteSending ? "Sending…" : "Send Invite"}
              </button>
            </div>
            {inviteError && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>
            )}
            {inviteMsg && (
              <p role="status" className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{inviteMsg}</p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
