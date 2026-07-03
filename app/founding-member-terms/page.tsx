import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Founding Member Terms | EstimateNepal",
  description: "Terms and conditions for EstimateNepal founding member pricing.",
};

export default function FoundingMemberTermsPage() {
  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/pricing" className="text-blue-600 hover:underline text-sm">
            ← Back to Pricing
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Founding Member Terms &amp; Conditions
        </h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. What is Founding Member Pricing?</h2>
            <p>
              Founding Member Pricing is a limited-time offer available to early subscribers of EstimateNepal.
              Users who subscribe during the founding member window receive a permanently locked monthly price
              for as long as their subscription remains active and in good standing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Price Lock Guarantee</h2>
            <p>
              Your founding member price will never increase as long as:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
              <li>Your subscription remains continuously active (no lapse in payment).</li>
              <li>You do not downgrade and re-upgrade your plan.</li>
              <li>Your account is not terminated for violation of our Terms of Service.</li>
            </ul>
            <p className="mt-3">
              If you cancel your subscription, your founding member price lock is forfeited. Upon re-subscribing,
              you will be charged the current market rate at that time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Annual Billing Offer</h2>
            <p>
              Founding members who choose annual billing pay for <strong>10 months</strong> and receive
              <strong> 12 months</strong> of access — an effective saving of 2 months per year.
              This offer applies to all paid founding member plans (Solo Pro, Team of 3, Team of 5).
            </p>
            <p className="mt-3">
              Annual subscriptions are paid upfront and are non-refundable after the first 7 days from
              the date of purchase. Monthly subscriptions may be cancelled at any time; access continues
              until the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Eligibility</h2>
            <p>
              Founding member pricing is available on a first-come, first-served basis during the early
              access launch period. EstimateNepal reserves the right to close the founding member window
              at any time without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Plan Changes</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>
                <strong>Upgrading</strong> to a higher-tier founding member plan: your new plan price will
                also be locked at the founding member rate for that tier, if still available.
              </li>
              <li>
                <strong>Downgrading</strong> to a lower plan and later upgrading again: the founding member
                price lock is forfeited on that plan change cycle.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Features &amp; Service Changes</h2>
            <p>
              EstimateNepal may add, modify, or remove features from any plan at any time. Founding member
              pricing locks in the <strong>price</strong>, not a specific feature set. We will always strive
              to improve the product for all subscribers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Free Plan</h2>
            <p>
              The Free plan (1 project, 1 user, 1 GB storage) is available indefinitely with no credit card
              required. It is not subject to these founding member terms, as it carries no subscription cost.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contact</h2>
            <p>
              Questions about your subscription or these terms? Reach us at{" "}
              <a href="mailto:support@estimatenepal.com" className="text-blue-600 hover:underline">
                support@estimatenepal.com
              </a>{" "}
              or via WhatsApp on our{" "}
              <Link href="/#contact" className="text-blue-600 hover:underline">
                contact page
              </Link>.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center">
          <Link
            href="/register"
            className="inline-block bg-blue-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-blue-700 transition"
          >
            Claim Founding Member Price
          </Link>
        </div>
      </div>
    </main>
  );
}
