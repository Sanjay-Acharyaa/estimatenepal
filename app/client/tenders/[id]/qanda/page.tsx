import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import QandAClientPanel from "./qanda-client";

type Params = { params: Promise<{ id: string }> };

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ClientQandAPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as { procurementRoles?: string[] }).procurementRoles) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(
    session.user.email as string,
    session.user.name as string,
    procurementRoles
  );

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) redirect("/client/tenders");

  const [tender, rawQuestions] = await Promise.all([
    prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, title: true, reference_number: true, qanda_deadline: true, status: true },
    }),
    prisma.bidQandAQuestion.findMany({
      where: { tender_id: tenderId },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        question_text: true,
        status: true,
        created_at: true,
        askedBy: { select: { full_name: true } },
        answers: {
          select: { id: true, answer_text: true, created_at: true, answeredBy: { select: { full_name: true } } },
          orderBy: { created_at: "asc" },
        },
      },
    }),
  ]);

  if (!tender) redirect("/client/tenders");

  const pendingCount = rawQuestions.filter((q) => q.status === "PENDING").length;
  const answeredCount = rawQuestions.filter((q) => q.status === "ANSWERED").length;
  const rejectedCount = rawQuestions.filter((q) => q.status === "REJECTED").length;

  const questions = rawQuestions.map((q) => ({
    id: q.id,
    question_text: q.question_text ?? "",
    status: q.status as "PENDING" | "ANSWERED" | "REJECTED",
    created_at: q.created_at.toISOString(),
    questioner_name: q.askedBy.full_name,
    answers: q.answers.map((a) => ({
      id: a.id,
      answer_text: a.answer_text,
      created_at: a.created_at.toISOString(),
      answered_by_name: a.answeredBy.full_name,
    })),
  }));

  const qandaOpen = !tender.qanda_deadline || tender.qanda_deadline > new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/client/tenders/${tenderId}`}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← {tender.reference_number} — {tender.title}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Questions &amp; Answers</h1>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-800">{pendingCount}</p>
            <p className="text-xs text-amber-700 mt-0.5">Pending</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-800">{answeredCount}</p>
            <p className="text-xs text-green-700 mt-0.5">Answered</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-500">{rejectedCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Rejected</p>
          </div>
        </div>

        {tender.qanda_deadline && (
          <p className="text-xs text-gray-500">
            Q&amp;A{" "}
            {qandaOpen
              ? `open until ${fmtDate(tender.qanda_deadline)}`
              : `closed on ${fmtDate(tender.qanda_deadline)}`}
          </p>
        )}

        <QandAClientPanel tenderId={tenderId} initialQuestions={questions} />
      </div>
    </div>
  );
}
