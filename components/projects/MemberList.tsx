"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  projectRole: string;
  user: { id: string; name: string; email: string; role: string };
};
type OrgUser = { id: string; name: string; email: string };

export function MemberList({
  projectId,
  members,
  orgUsers,
  isAdmin,
}: {
  projectId: string;
  members: Member[];
  orgUsers: OrgUser[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState("");
  const [role, setRole] = useState("ESTIMATOR");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setAdding(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUser, projectRole: role }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setError(data.error?.message ?? "Failed to add member."); return; }
    setSelectedUser("");
    router.refresh();
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    setRemovingId(userId);
    await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    setRemovingId(null);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Team Members</h2>

      {error && (
        <p role="alert" className="text-red-600 text-xs mb-2">{error}</p>
      )}

      <div className="space-y-2 mb-4">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Avatar initial — decorative, no img alt needed */}
              <div
                aria-hidden
                className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium select-none"
              >
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                {/* Upgraded from text-gray-600 (2.5:1) to text-gray-600 (7.4:1) — WCAG AA pass */}
                <p className="text-xs text-gray-600">{m.projectRole}</p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => removeMember(m.userId, m.user.name)}
                disabled={removingId === m.userId}
                aria-label={`Remove ${m.user.name} from project`}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40 focus:outline-none focus:underline"
              >
                {removingId === m.userId ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-gray-600">No members assigned yet.</p>
        )}
      </div>

      {isAdmin && orgUsers.length > 0 && (
        /* form wrapper — Enter in any field submits, not just the button onClick */
        <form
          onSubmit={handleAddMember}
          className="border-t border-gray-100 pt-3 space-y-2"
          aria-label="Add project member"
        >
          <p className="text-xs font-medium text-gray-700">Add Member</p>
          <label htmlFor="member-select" className="sr-only">Select user to add</label>
          <select
            id="member-select"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select user…</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>

          <label htmlFor="member-role" className="sr-only">Project role</label>
          <select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ESTIMATOR">Estimator</option>
            <option value="LEAD">Lead</option>
            <option value="VIEWER">Viewer</option>
          </select>

          <button
            type="submit"
            disabled={adding || !selectedUser}
            aria-busy={adding}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded transition disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to Project"}
          </button>
        </form>
      )}
    </div>
  );
}
