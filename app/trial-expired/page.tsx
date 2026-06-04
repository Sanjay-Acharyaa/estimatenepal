import Link from "next/link";

export default function TrialExpiredPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">⏰</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Trial Expired</h1>
        <p className="text-gray-500 text-sm mb-6">
          Your free trial period has ended. Please upgrade your plan to continue using NepaliEstimate.
        </p>
        <div className="space-y-3">
          <a href="mailto:support@nepaliestimate.com"
            className="block w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
            Contact Us to Upgrade
          </a>
          <Link href="/login" className="block w-full border border-gray-300 text-gray-600 py-3 rounded-lg text-sm hover:bg-gray-50 transition">
            Sign In with a Different Account
          </Link>
        </div>
      </div>
    </div>
  );
}
