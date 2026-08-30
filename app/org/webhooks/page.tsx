"use client";

import { useEffect, useState } from "react";

type WebhookEndpoint = {
  id: number;
  label: string;
  url: string;
  events: string;
  enabled: boolean;
  created_at: string;
};

type Delivery = {
  id: number;
  event_type: string;
  status: string;
  attempt_count: number;
  response_status: number | null;
  created_at: string;
};

const ALL_EVENTS = ["bid.submitted", "tender.awarded", "contract.signed", "snag.raised"] as const;

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<{ id: number; secret: string } | null>(null);

  const [form, setForm] = useState({ label: "", url: "", events: [] as string[] });
  const [formError, setFormError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});
  const [deliveryOpen, setDeliveryOpen] = useState<Record<number, boolean>>({});
  const [deliveryLoading, setDeliveryLoading] = useState<Record<number, boolean>>({});

  async function fetchEndpoints() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/webhooks");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? "Failed to load webhooks.");
        return;
      }
      const d = await res.json();
      setEndpoints(d.endpoints ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchEndpoints(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.label.trim()) { setFormError("Label is required."); return; }
    if (!form.url.trim()) { setFormError("URL is required."); return; }
    if (form.events.length === 0) { setFormError("Select at least one event."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/org/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), url: form.url.trim(), events: form.events }),
      });
      const d = await res.json();
      if (!res.ok) { setFormError(d.message ?? "Failed to create webhook."); return; }
      setNewSecret({ id: d.endpoint.id, secret: d.secret });
      setForm({ label: "", url: "", events: [] });
      setShowForm(false);
      fetchEndpoints();
    } catch {
      setFormError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ep: WebhookEndpoint) {
    const res = await fetch(`/api/org/webhooks/${ep.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !ep.enabled }),
    });
    if (res.ok) {
      setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, enabled: !ep.enabled } : e));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this webhook endpoint? This cannot be undone.")) return;
    const res = await fetch(`/api/org/webhooks/${id}`, { method: "DELETE" });
    if (res.ok) setEndpoints((prev) => prev.filter((e) => e.id !== id));
  }

  async function loadDeliveries(id: number) {
    const isOpen = deliveryOpen[id];
    setDeliveryOpen((prev) => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !deliveries[id]) {
      setDeliveryLoading((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/org/webhooks/${id}/deliveries`);
        if (res.ok) {
          const d = await res.json();
          setDeliveries((prev) => ({ ...prev, [id]: d.deliveries ?? [] }));
        }
      } finally {
        setDeliveryLoading((prev) => ({ ...prev, [id]: false }));
      }
    }
  }

  function toggleEvent(event: string) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Webhook Endpoints</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send procurement events to your systems via HTTP POST.</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null); }}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "Add endpoint"}
        </button>
      </div>

      {newSecret && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <p className="text-sm font-medium text-amber-800 mb-1">Webhook secret - copy it now, it will not be shown again.</p>
          <code className="block text-xs font-mono text-amber-900 break-all bg-amber-100 rounded px-2 py-1.5">{newSecret.secret}</code>
          <button onClick={() => setNewSecret(null)} className="mt-2 text-xs text-amber-700 hover:underline">Dismiss</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border border-gray-200 rounded-xl bg-gray-50 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">New endpoint</h2>

          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Slack notifications"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://example.com/webhook"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Events</p>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded"
                  />
                  <span className="font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? "Creating..." : "Create endpoint"}
          </button>
        </form>
      )}

      {loading && (
        <div className="text-sm text-gray-500 text-center py-10">Loading...</div>
      )}

      {error && (
        <div className="text-sm text-red-600 text-center py-6">{error}</div>
      )}

      {!loading && !error && endpoints.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-10">No webhook endpoints yet.</p>
      )}

      <div className="space-y-3">
        {endpoints.map((ep) => (
          <div key={ep.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{ep.label}</p>
                <p className="text-xs font-mono text-gray-500 truncate mt-0.5">{ep.url}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ep.events.split(",").map((ev) => (
                    <span key={ev} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-mono">{ev.trim()}</span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(ep)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${ep.enabled ? "bg-blue-600" : "bg-gray-300"}`}
                  aria-label={ep.enabled ? "Disable endpoint" : "Enable endpoint"}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ep.enabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>

                <button
                  onClick={() => loadDeliveries(ep.id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {deliveryOpen[ep.id] ? "Hide logs" : "Logs"}
                </button>

                <button
                  onClick={() => handleDelete(ep.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>

            {deliveryOpen[ep.id] && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                {deliveryLoading[ep.id] && (
                  <p className="text-xs text-gray-500">Loading deliveries...</p>
                )}
                {!deliveryLoading[ep.id] && (!deliveries[ep.id] || deliveries[ep.id].length === 0) && (
                  <p className="text-xs text-gray-500">No deliveries yet.</p>
                )}
                {!deliveryLoading[ep.id] && deliveries[ep.id]?.length > 0 && (
                  <div className="space-y-1">
                    {deliveries[ep.id].map((d) => (
                      <div key={d.id} className="flex items-center gap-3 text-xs text-gray-700">
                        <span className={`font-medium ${d.status === "SUCCESS" ? "text-green-600" : d.status === "PENDING" ? "text-yellow-600" : "text-red-600"}`}>
                          {d.status}
                        </span>
                        <span className="font-mono text-gray-500">{d.event_type}</span>
                        {d.response_status && <span className="text-gray-500">HTTP {d.response_status}</span>}
                        <span className="text-gray-400">{new Date(d.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
