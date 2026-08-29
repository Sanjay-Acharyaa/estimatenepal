"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Contractor = {
  id: number;
  full_name: string;
  account_type: string;
  status: string;
  organization: {
    name: string;
    district: string;
    verified: boolean;
    class: string;
  } | null;
};

type PublishedTender = {
  id: number;
  title: string;
};

interface Props {
  contractors: Contractor[];
  publishedTenders: PublishedTender[];
  isClient: boolean;
}

export default function ContractorsPanel({ contractors, publishedTenders, isClient }: Props) {
  const router = useRouter();
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [selectedTenderId, setSelectedTenderId] = useState<string>("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);

  function openModal(contractor: Contractor) {
    setSelectedContractor(contractor);
    setSelectedTenderId(publishedTenders[0]?.id.toString() ?? "");
    setInviteResult(null);
  }

  function closeModal() {
    setSelectedContractor(null);
    setInviteResult(null);
    setInviting(false);
  }

  async function handleInvite() {
    if (!selectedContractor || !selectedTenderId) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch(`/api/tenders/${selectedTenderId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractor_user_id: selectedContractor.id }),
      });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (res.status === 409) {
        setInviteResult({ ok: false, message: "This contractor has already been invited to that tender." });
      } else if (!res.ok) {
        setInviteResult({ ok: false, message: data?.error?.message ?? "Failed to send invitation." });
      } else {
        setInviteResult({ ok: true, message: `Invitation sent to ${selectedContractor.full_name}.` });
      }
    } catch {
      setInviteResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setInviting(false);
    }
  }

  if (contractors.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No contractors found</p>
        <p className="text-sm mt-1">Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {contractors.map((c) => (
          <div
            key={c.id}
            className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900 text-sm leading-snug">{c.full_name}</p>
            </div>

            {c.organization && (
              <div className="text-xs text-gray-600">
                <span className="font-medium">{c.organization.name}</span>
                {c.organization.district && (
                  <span className="text-gray-400"> · {c.organization.district}</span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {c.account_type === "INDIVIDUAL" ? "Individual" : "Company"}
              </span>
              {c.status === "ACTIVE" && (
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Active</span>
              )}
              {c.organization && c.organization.class !== "UNCLASSIFIED" && (
                <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                  {c.organization.class}
                </span>
              )}
              {c.organization?.verified && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">✓ Verified</span>
              )}
            </div>

            <div className="flex gap-2 mt-auto pt-1">
              {isClient && publishedTenders.length > 0 && (
                <button
                  onClick={() => openModal(c)}
                  className="ml-auto text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                >
                  Invite to tender
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedContractor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Invite {selectedContractor.full_name}
              </h2>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select tender</label>
              <select
                value={selectedTenderId}
                onChange={(e) => setSelectedTenderId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {publishedTenders.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.title}</option>
                ))}
              </select>
              {inviteResult && (
                <p className={`mt-3 text-sm ${inviteResult.ok ? "text-green-700" : "text-red-600"}`}>
                  {inviteResult.message}
                </p>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
              >
                Cancel
              </button>
              {!inviteResult?.ok && (
                <button
                  onClick={handleInvite}
                  disabled={inviting || !selectedTenderId}
                  className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviting ? "Sending…" : "Send invitation"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
