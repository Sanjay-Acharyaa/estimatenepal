export const metadata = {
  title: "Thank you — Estimate Nepal",
  description: "Your feedback has been received.",
};

const CHURN_LABELS: Record<string, string> = {
  too_expensive:    "Too expensive",
  missing_features: "Missing features",
  just_exploring:   "Just exploring / not ready yet",
  competitor:       "Went with a competitor",
  too_complex:      "Too complex / hard to use",
  not_relevant:     "Not relevant to my work",
  other:            "Something else",
};

function npsMessage(score: number): string {
  if (score >= 9) return "Amazing — we're so glad you love Estimate Nepal!";
  if (score >= 7) return "Thanks — we're glad it's working for you.";
  if (score >= 5) return "Thanks for your honesty. We'll keep improving.";
  return "We're sorry to hear that. Your feedback helps us get better.";
}

export default function FeedbackThanksPage({
  searchParams,
}: {
  searchParams?: { type?: string; reason?: string; score?: string };
}) {
  const type   = searchParams?.type;
  const reason = searchParams?.reason;
  const score  = parseInt(searchParams?.score ?? "", 10);

  const isChurn = type === "churn";
  const isNps   = type === "nps";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">

        <div className="text-5xl mb-5">
          {isNps && !isNaN(score) ? (score >= 9 ? "😍" : score >= 7 ? "😊" : score >= 5 ? "😐" : "😕") : "🙏"}
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-3">
          Thank you for your feedback!
        </h1>

        {isChurn && reason && CHURN_LABELS[reason] && (
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            You selected: <strong className="text-slate-700">{CHURN_LABELS[reason]}</strong>
            <br />Your response helps us improve Estimate Nepal.
          </p>
        )}

        {isNps && !isNaN(score) && (
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your score: <strong className="text-slate-700">{score}/10</strong>
            <br />{npsMessage(score)}
          </p>
        )}

        {!isChurn && !isNps && (
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            We appreciate you taking the time to share your thoughts.
          </p>
        )}

        <a
          href="/login"
          className="inline-block bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Login
        </a>

        <p className="mt-6 text-xs text-slate-300">
          Estimate Nepal · Nepal&apos;s Smart Construction Platform
        </p>
      </div>
    </div>
  );
}
