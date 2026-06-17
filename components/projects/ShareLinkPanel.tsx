"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ShareLink = {
  id: string;
  token: string;
  expiresAt: Date | null;
  viewCount: number;
  createdAt: Date;
};

export function ShareLinkPanel({
  projectId,
  shareLinks,
}: {
  projectId: string;
  shareLinks: ShareLink[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [days, setDays] = useState("");
  const [copied, setCopied] = useState("");

  async function createLink() {
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/share-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(days ? { expiresInDays: parseInt(days) } : {}),
    });
    setCreating(false);
    if (res.ok) { setDays(""); router.refresh(); }
  }

  async function deactivate(linkId: string) {
    await fetch(`/api/projects/${projectId}/share-links/${linkId}`, { method: "DELETE" });
    router.refresh();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Share Links</h2>

      <div className="space-y-2 mb-4">
        {shareLinks.map((link) => (
          <div key={link.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <div className="text-xs text-gray-600">
              <span className="font-mono">{link.token.slice(0, 12)}…</span>
              <p className="text-gray-600 mt-0.5">
                {link.expiresAt
                  ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                  : "No expiry"} · {link.viewCount} views
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyLink(link.token)}
                aria-label={`Copy share link ${link.token.slice(0, 8)}…`}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {copied === link.token ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => deactivate(link.id)}
                aria-label={`Revoke share link ${link.token.slice(0, 8)}…`}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
        {shareLinks.length === 0 && (
          <p className="text-sm text-gray-600">No active share links.</p>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">Create Share Link</p>
        <div className="flex gap-2">
          <label htmlFor="share-expires-days" className="sr-only">Link expiry in days (optional)</label>
          <input
            id="share-expires-days"
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="Expires in days (optional)"
            min="1"
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={createLink}
            disabled={creating}
            aria-busy={creating}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded transition disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
