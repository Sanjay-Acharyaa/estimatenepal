"use client";

import { useState } from "react";

const MAX = 2000;

export function ChurnTextForm({ org, feedbackKey }: { org: string; feedbackKey: string }) {
  const [chars, setChars] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/feedback/churn-text"
      method="POST"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="orgId" value={org} />
      <input type="hidden" name="key"   value={feedbackKey} />
      <textarea
        name="text"
        placeholder="What was missing, what did not work, or what we could do better..."
        required
        maxLength={MAX}
        rows={5}
        onChange={e => setChars(e.target.value.length)}
        disabled={submitting}
        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-2 disabled:opacity-50"
      />
      <p className={`text-xs text-right mb-4 ${chars > MAX * 0.9 ? "text-amber-500" : "text-slate-300"}`}>
        {chars} / {MAX}
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Sending..." : "Send Feedback"}
      </button>
    </form>
  );
}
