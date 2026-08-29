"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Invitation {
  id: number;
  status: string;
  invited_at: string;
  responded_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-600",
};

const STATUS_MESSAGES: Record<string, string> = {
  ACCEPTED: "You accepted this invitation. You can now submit a bid for this tender.",
  DECLINED: "You declined this invitation.",
  EXPIRED: "This invitation has expired and can no longer be responded to.",
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function InvitationRespond({
  tenderId,
  invitation,
}: {
  tenderId: number;
  invitation: Invitation;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(invitation.status);
  const [respondedAt, setRespondedAt] = useState(invitation.responded_at);
  const [acting, setActing] = useState<"ACCEPTED" | "DECLINED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "ACCEPTED" | "DECLINED") {
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/invitations/${invitation.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setError(data.error?.message ?? "Action failed.");
        return;
      }
      setStatus(data.invitation.status);
      setRespondedAt(data.invitation.responded_at ?? new Date().toISOString());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Invitation status</p>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
          {status}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-500">
        <p>Invited: {fmtDate(invitation.invited_at)}</p>
        {respondedAt && <p>Responded: {fmtDate(respondedAt)}</p>}
      </div>

      {status === "PENDING" ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Would you like to accept or decline this invitation?</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => respond("ACCEPTED")}
              disabled={acting !== null}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {acting === "ACCEPTED" ? "Accepting…" : "Accept invitation"}
            </button>
            <button
              onClick={() => respond("DECLINED")}
              disabled={acting !== null}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {acting === "DECLINED" ? "Declining…" : "Decline"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          {STATUS_MESSAGES[status] ?? `Status: ${status}`}
        </p>
      )}
    </div>
  );
}
