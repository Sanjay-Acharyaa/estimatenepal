export const metadata = {
  title: "Share Your Feedback — Estimate Nepal",
  description: "Tell us more about your experience with Estimate Nepal.",
};

export default function ChurnTextPage({
  searchParams,
}: {
  searchParams?: { org?: string; key?: string };
}) {
  const org = searchParams?.org;
  const key = searchParams?.key;

  if (!org || !key) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <p className="text-slate-500 text-sm">This link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-10">
        <div className="text-4xl text-center mb-5">💬</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2 text-center">
          Tell us more
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8 text-center">
          What could have made Estimate Nepal work better for you?
          We read every response and use it to improve the product.
        </p>

        <form action="/api/feedback/churn-text" method="POST">
          <input type="hidden" name="orgId" value={org} />
          <input type="hidden" name="key"   value={key} />
          <textarea
            name="text"
            placeholder="Your thoughts here — what was missing, what didn't work, or what we could do better..."
            required
            maxLength={2000}
            rows={5}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-5"
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Send Feedback
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-300 text-center">
          Estimate Nepal · Nepal&apos;s Smart Construction Platform
        </p>
      </div>
    </div>
  );
}
