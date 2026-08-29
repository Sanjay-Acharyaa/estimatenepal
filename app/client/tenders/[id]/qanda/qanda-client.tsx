"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AnswerItem {
  id: number;
  answer_text: string;
  created_at: string;
  answered_by_name: string;
}

interface ClientQuestion {
  id: number;
  question_text: string;
  status: "PENDING" | "ANSWERED" | "REJECTED";
  created_at: string;
  questioner_name: string;
  answers: AnswerItem[];
}

interface Props {
  tenderId: number;
  initialQuestions: ClientQuestion[];
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function QandAClientPanel({ tenderId, initialQuestions }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<ClientQuestion[]>(initialQuestions);
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pending = questions.filter((q) => q.status === "PENDING");
  const answered = questions.filter((q) => q.status === "ANSWERED");
  const rejected = questions.filter((q) => q.status === "REJECTED");

  async function postAnswer(questionId: number) {
    const answerText = (answerDrafts[questionId] ?? "").trim();
    if (!answerText) { setActionError("Answer text is required."); return; }
    setBusy(questionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/qanda/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer_text: answerText }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setActionError(data.error?.message ?? "Failed to post answer.");
        return;
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                status: "ANSWERED" as const,
                answers: [
                  ...q.answers,
                  { id: data.answer.id, answer_text: answerText, created_at: data.answer.created_at, answered_by_name: "You" },
                ],
              }
            : q
        )
      );
      setAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function rejectQuestion(questionId: number) {
    if (!confirm("Reject this question? It will not be visible to contractors.")) return;
    setBusy(questionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/qanda/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setActionError(data.error?.message ?? "Failed to reject question.");
        return;
      }
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, status: "REJECTED" as const } : q))
      );
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center">
        <p className="text-sm text-gray-400">No questions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Pending review
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-4">
            {pending.map((q) => (
              <div key={q.id} className="rounded-xl border border-amber-200 bg-white p-5">
                <p className="text-sm font-medium text-gray-900">{q.question_text}</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  From {q.questioner_name} · {fmtDate(q.created_at)}
                </p>
                <textarea
                  value={answerDrafts[q.id] ?? ""}
                  onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={3}
                  placeholder="Type your answer… (published anonymously to all bidders)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mb-3"
                  disabled={busy === q.id}
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => postAnswer(q.id)}
                    disabled={busy === q.id}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === q.id ? "Posting…" : "Post answer"}
                  </button>
                  <button
                    onClick={() => rejectQuestion(q.id)}
                    disabled={busy === q.id}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {answered.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Answered
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {answered.length}
            </span>
          </h2>
          <div className="space-y-4">
            {answered.map((q) => (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm font-medium text-gray-900">{q.question_text}</p>
                <p className="text-xs text-gray-400 mt-0.5 mb-3">
                  From {q.questioner_name} · {fmtDate(q.created_at)}
                </p>
                {q.answers.map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.answer_text}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {a.answered_by_name} · {fmtDate(a.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {rejected.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            Rejected
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {rejected.length}
            </span>
          </h2>
          <div className="space-y-3">
            {rejected.map((q) => (
              <div key={q.id} className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 opacity-60">
                <p className="text-sm text-gray-600">{q.question_text}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  From {q.questioner_name} · {fmtDate(q.created_at)} ·{" "}
                  <span className="text-red-500">Rejected</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
