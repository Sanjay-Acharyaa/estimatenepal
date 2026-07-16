export default function ResubscribedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-5">✅</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re re-subscribed!</h1>
        <p className="text-slate-500 text-sm mb-6">
          You&apos;ll start receiving lifecycle emails from Estimate Nepal again.
          You can unsubscribe at any time from the link in any email.
        </p>
        <a
          href="/dashboard"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
