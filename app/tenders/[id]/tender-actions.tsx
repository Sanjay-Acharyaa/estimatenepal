"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  tenderId: number;
  tenderType: "PUBLIC" | "INVITATION_ONLY";
  invitation: { id: number; status: string } | null;
  existingRtb: { status: string } | null;
  existingBidId: number | null;
  existingBidStatus: string | null;
  isLoggedIn: boolean;
  isContractor: boolean;
}

export default function TenderActions({
  tenderId,
  tenderType,
  invitation,
  existingRtb,
  existingBidId,
  existingBidStatus,
  isLoggedIn,
  isContractor,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRtbStatus, setLocalRtbStatus] = useState<string | null>(existingRtb?.status ?? null);
  const [localInvStatus, setLocalInvStatus] = useState<string | null>(invitation?.status ?? null);
  const [localBidId, setLocalBidId] = useState<number | null>(
    existingBidStatus === "WITHDRAWN" ? null : existingBidId
  );
  const bidWithdrawn = existingBidStatus === "WITHDRAWN";

  async function startBid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids`, { method: "POST" });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (res.status === 409) { router.push("/contractor/bids"); return; }
      if (!res.ok) { setError(data.error?.message ?? "Failed to start bid."); return; }
      setLocalBidId(data.bid.id);
      router.push(`/tenders/${tenderId}/bids/${data.bid.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function respondToInvitation(action: "ACCEPTED" | "DECLINED") {
    if (!invitation) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/invitations/${invitation.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Action failed."); return; }
      setLocalInvStatus(action === "ACCEPTED" ? "ACCEPTED" : "DECLINED");
      if (action === "ACCEPTED") router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestToBid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/request-to-bid`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Request failed."); return; }
      setLocalRtbStatus(data.request.status as string);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-600 mb-3">Sign in to bid on this tender.</p>
        <Link
          href={`/login?callbackUrl=/tenders/${tenderId}`}
          className="inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Sign in to bid
        </Link>
        <span className="ml-3 text-sm text-gray-400">
          or{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            create an account
          </Link>
        </span>
      </div>
    );
  }

  if (!isContractor) return null;

  if (invitation) {
    if (localInvStatus === "ACCEPTED") {
      return (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-medium text-green-800 mb-3">You have accepted this invitation.</p>
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          {bidWithdrawn ? (
            <p className="text-sm text-gray-500">You withdrew your bid. Withdrawal is final.</p>
          ) : localBidId ? (
            <Link
              href={`/tenders/${tenderId}/bids/${localBidId}`}
              className="inline-block rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Continue bid →
            </Link>
          ) : (
            <button
              onClick={startBid}
              disabled={busy}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start bidding →"}
            </button>
          )}
        </div>
      );
    }

    if (localInvStatus === "DECLINED") {
      return (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm text-gray-500">You declined this invitation.</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
        <p className="text-sm font-medium text-yellow-900 mb-1">You have been invited to bid.</p>
        <p className="text-xs text-yellow-700 mb-4">Accept the invitation to unlock the bid form.</p>
        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={() => respondToInvitation("ACCEPTED")}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "…" : "Accept invitation"}
          </button>
          <button
            onClick={() => respondToInvitation("DECLINED")}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? "…" : "Decline"}
          </button>
        </div>
      </div>
    );
  }

  if (tenderType === "PUBLIC") {
    if (localRtbStatus === "APPROVED") {
      return (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-medium text-green-800 mb-3">Your request to bid has been approved.</p>
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          {bidWithdrawn ? (
            <p className="text-sm text-gray-500">You withdrew your bid. Withdrawal is final.</p>
          ) : localBidId ? (
            <Link
              href={`/tenders/${tenderId}/bids/${localBidId}`}
              className="inline-block rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Continue bid →
            </Link>
          ) : (
            <button
              onClick={startBid}
              disabled={busy}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start bidding →"}
            </button>
          )}
        </div>
      );
    }

    if (localRtbStatus === "PENDING") {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-medium text-blue-800">Request submitted</p>
          <p className="text-xs text-blue-600 mt-1">Waiting for the client to approve your request to bid.</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-600 mb-4">
          Submit a request to bid on this tender. The client will review and approve before you can access the bid form.
        </p>
        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
        <button
          onClick={requestToBid}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Request to bid"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <p className="text-sm text-gray-500">This is an invitation-only tender. Contact the client to request an invitation.</p>
    </div>
  );
}
