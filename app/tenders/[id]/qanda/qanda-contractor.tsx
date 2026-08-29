"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AnswerItem {
  id: number;
  answer_text: string;
  created_at: string;
}

interface QuestionItem {
  id: number;
  question_text: string | null;
  status: string;
  created_at: string;
  answers: AnswerItem[];
}

interface PendingQuestion {
  id: number;
  question_text: string;
  status: string;
  created_at: string;
}

interface Props {
  tenderId: number;
  canPost: boolean;
  isLoggedIn: boolean;
  userRole: string | null;
  initialQuestions: QuestionItem[];
  myPendingQuestions: PendingQuestion[];
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function QandAContractorPanel({
  tenderId,
  canPost,
  isLoggedIn,
  userRole,
  initialQuestions,
  myPendingQuestions,
}: Props) {
  const router = useRouter();
  const [questions] = useState<QuestionItem[]>(initialQuestions);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setSubmitError("Question must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/qanda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setSubmitError(data.error?.message ?? "Failed to submit question.");
        return;
      }
      setText("");
      setSubmitSuccess(true);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!isLoggedIn ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600 mb-3">Sign in to submit a question.</p>
          <Link
            href={`/login?next=/tenders/${tenderId}/qanda`}
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      ) : userRole !== "CONTRACTOR" ? null : !canPost ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Q&amp;A is closed for this tender or you do not have bidding access yet.
        </div>
      ) : submitSuccess ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>Question submitted.</strong> The client will review it and publish an answer visible to all bidders.
          <button
            onClick={() => { setSubmitSuccess(false); setText(""); }}
            className="ml-3 text-xs font-medium text-green-700 underline"
          >
            Ask another
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Submit a question</h2>
          <p className="text-xs text-gray-500 mb-3">
            Answers are published anonymously to all bidders. Do not include rates or proprietary information.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Type your question here (minimum 10 characters)…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            {submitError && <p className="text-xs text-red-600">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit question"}
            </button>
          </form>
        </div>
      )}

      {userRole === "CONTRACTOR" && myPendingQuestions.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-800 mb-3">Your questions</h2>
          <ol className="space-y-3">
            {myPendingQuestions.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{q.question_text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(q.created_at)}</p>
                </div>
                <span
                  className={`shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    q.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {q.status === "PENDING" ? "Awaiting review" : "Not published"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Published answers
          {questions.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {questions.length}
            </span>
          )}
        </h2>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400">No answers published yet.</p>
        ) : (
          <ol className="space-y-5">
            {questions.map((q, idx) => (
              <li key={q.id} className="space-y-2">
                <div className="flex gap-3">
                  <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{q.question_text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(q.created_at)}</p>
                  </div>
                </div>
                {q.answers.map((a) => (
                  <div key={a.id} className="ml-8 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.answer_text}</p>
                    <p className="text-xs text-gray-400 mt-1">Published {fmtDate(a.created_at)}</p>
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
