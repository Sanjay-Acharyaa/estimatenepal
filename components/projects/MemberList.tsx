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
  const [error, setError] = useState("");

  async function addMember() {
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

  async function removeMember(userId: string) {
    await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Team Members</h2>

      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

      <div className="space-y-2 mb-4">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                <p className="text-xs text-gray-400">{m.projectRole}</p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => removeMember(m.userId)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-gray-400">No members assigned yet.</p>}
      </div>

      {isAdmin && orgUsers.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">Add Member</p>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select user...</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ESTIMATOR">Estimator</option>
            <option value="LEAD">Lead</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button
            onClick={addMember}
            disabled={adding || !selectedUser}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded transition disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add to Project"}
          </button>
        </div>
      )}
    </div>
  );
}
