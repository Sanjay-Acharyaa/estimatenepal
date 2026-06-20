"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Testimonial = {
  id: string;
  authorName: string;
  authorRole: string | null;
  company: string | null;
  content: string;
  rating: number;
  isApproved: boolean;
  userId: string | null;
  submittedAt: string;
  approvedAt: string | null;
};

export default function AdminTestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/testimonials");
    if (res.ok) setTestimonials(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(id: string, action: "approve" | "reject" | "delete") {
    setBusy(id);
    setMsg("");
    if (action === "delete") {
      const res = await fetch(`/api/admin/testimonials/${id}`, { method: "DELETE" });
      if (res.ok) { setMsg("Deleted."); setTestimonials(t => t.filter(x => x.id !== id)); }
    } else {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setMsg(`${action === "approve" ? "Approved" : "Rejected"}.`);
        setTestimonials(t => t.map(x => x.id === id ? { ...x, isApproved: action === "approve", approvedAt: action === "approve" ? new Date().toISOString() : null } : x));
      }
    }
    setBusy(null);
  }

  const pending = testimonials.filter(t => !t.isApproved);
  const approved = testimonials.filter(t => t.isApproved);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Testimonials</span>
        {pending.length > 0 && (
          <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="p-8 max-w-5xl mx-auto space-y-8">
        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg">
            {msg}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : (
          <>
            {/* Pending */}
            <section>
              <h2 className="text-base font-bold text-gray-800 mb-3">
                Pending Review ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-6 py-8 text-center">
                  No pending testimonials.
                </p>
              ) : (
                <div className="space-y-3">
                  {pending.map(t => (
                    <TestimonialCard key={t.id} t={t} busy={busy} onAct={act} />
                  ))}
                </div>
              )}
            </section>

            {/* Approved */}
            <section>
              <h2 className="text-base font-bold text-gray-800 mb-3">
                Approved & Live ({approved.length})
              </h2>
              {approved.length === 0 ? (
                <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-6 py-8 text-center">
                  No approved testimonials yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {approved.map(t => (
                    <TestimonialCard key={t.id} t={t} busy={busy} onAct={act} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function TestimonialCard({
  t, busy, onAct,
}: {
  t: Testimonial;
  busy: string | null;
  onAct: (id: string, action: "approve" | "reject" | "delete") => void;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${t.isApproved ? "border-green-200" : "border-amber-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 text-sm">{t.authorName}</span>
            {t.authorRole && <span className="text-xs text-gray-500">· {t.authorRole}</span>}
            {t.company && <span className="text-xs text-gray-500">· {t.company}</span>}
            <span className="text-amber-400 text-xs">{"★".repeat(t.rating)}</span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{t.content}</p>
          <p className="text-xs text-gray-400 mt-2">
            Submitted {new Date(t.submittedAt).toLocaleDateString()}
            {t.approvedAt && ` · Approved ${new Date(t.approvedAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!t.isApproved && (
            <button
              onClick={() => onAct(t.id, "approve")}
              disabled={busy === t.id}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {t.isApproved && (
            <button
              onClick={() => onAct(t.id, "reject")}
              disabled={busy === t.id}
              className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              Unpublish
            </button>
          )}
          <button
            onClick={() => onAct(t.id, "delete")}
            disabled={busy === t.id}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
