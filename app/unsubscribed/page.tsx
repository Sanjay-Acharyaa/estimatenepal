import { createHmac } from "crypto";
import Link from "next/link";

export const metadata = {
  title: "Unsubscribed — Estimate Nepal",
  description: "You have been unsubscribed from Estimate Nepal marketing emails.",
};

// H3: Generate the resubscribe key server-side using the :resubscribe suffix.
// This is separate from the :unsubscribe key so capturing one link can't toggle the other.
function buildResubKey(userId: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(userId + ":resubscribe").digest("hex").slice(0, 20);
}

// Server component — receives user+key from the unsubscribe redirect query params.
// Verifies the unsubscribe key, then generates a separate resubscribe key for the link.
export default function UnsubscribedPage({
  searchParams,
}: {
  searchParams?: { user?: string; key?: string };
}) {
  const userId = searchParams?.user;
  const resubKey = userId ? buildResubKey(userId) : null;

  const resubUrl =
    userId && resubKey
      ? `/api/email/resubscribe?user=${encodeURIComponent(userId)}&key=${encodeURIComponent(resubKey)}`
      : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">

        <div className="mx-auto mb-6 w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-3">You&apos;ve been unsubscribed</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">
          You won&apos;t receive any more marketing emails from Estimate Nepal.
          You&apos;ll still receive important account emails like password resets and team invitations.
        </p>

        {resubUrl ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-8 text-left">
            <p className="text-xs text-amber-700 font-medium mb-1">Unsubscribed by mistake?</p>
            <a
              href={resubUrl}
              className="text-xs text-amber-600 underline hover:text-amber-800"
            >
              Click here to re-subscribe and resume lifecycle emails →
            </a>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-8 text-left">
            <p className="text-xs text-slate-500 font-medium mb-1">Changed your mind?</p>
            <p className="text-xs text-slate-400">
              Log in to your account to update your notification preferences.
            </p>
          </div>
        )}

        <Link
          href="/login"
          className="inline-block bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Login
        </Link>

        <p className="mt-6 text-xs text-slate-300">Estimate Nepal · Nepal&apos;s Smart Construction Platform</p>
      </div>
    </div>
  );
}
