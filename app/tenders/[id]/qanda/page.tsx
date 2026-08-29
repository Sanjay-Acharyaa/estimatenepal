import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import QandAContractorPanel from "./qanda-contractor";

type Params = { params: Promise<{ id: string }> };

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function QandAPublicPage({ params }: Params) {
  const session = await getSession();
  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const procurementRoles = ((session?.user as { procurementRoles?: string[] })?.procurementRoles) ?? [];
  const isContractor = procurementRoles.includes("CONTRACTOR");

  let bidUserId: number | null = null;
  if (session?.user && isContractor) {
    const { getOrCreateBidUser: getBidUser } = await import("@/lib/bid-user");
    const bidUser = await getBidUser(session.user.email as string, session.user.name as string, procurementRoles);
    bidUserId = bidUser.id;
  }

  const tenderFilter = isContractor && bidUserId
    ? {
        id: tenderId,
        status: "PUBLISHED",
        OR: [
          { tender_type: "PUBLIC" },
          { invitations: { some: { contractor_user_id: bidUserId, status: "ACCEPTED" } } },
          { requestsToBid: { some: { contractor_user_id: bidUserId, status: "APPROVED" } } },
        ],
      }
    : { id: tenderId, status: "PUBLISHED", tender_type: "PUBLIC" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tender = await prisma.tender.findFirst({
    where: tenderFilter as any,
    select: { id: true, title: true, reference_number: true, qanda_deadline: true },
  });
  if (!tender) notFound();

  const [questions, myPendingQuestions] = await Promise.all([
    prisma.bidQandAQuestion.findMany({
      where: { tender_id: tenderId, status: "ANSWERED" },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        question_text: true,
        status: true,
        created_at: true,
        answers: {
          select: { id: true, answer_text: true, created_at: true },
          orderBy: { created_at: "asc" },
        },
      },
    }),
    isContractor && bidUserId
      ? prisma.bidQandAQuestion.findMany({
          where: { tender_id: tenderId, asked_by_user_id: bidUserId, status: { in: ["PENDING", "REJECTED"] } },
          orderBy: { created_at: "asc" },
          select: { id: true, question_text: true, status: true, created_at: true },
        })
      : Promise.resolve([]),
  ]);

  const qandaOpen = !tender.qanda_deadline || tender.qanda_deadline > new Date();
  const canPost = isContractor && qandaOpen;

  const initialQuestions = questions.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    status: q.status,
    created_at: q.created_at.toISOString(),
    answers: q.answers.map((a) => ({
      id: a.id,
      answer_text: a.answer_text,
      created_at: a.created_at.toISOString(),
    })),
  }));

  const pendingList = myPendingQuestions.map((q) => ({
    id: q.id,
    question_text: q.question_text ?? "",
    status: q.status,
    created_at: q.created_at.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/tenders/${tenderId}`}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← {tender.reference_number} — {tender.title}
          </Link>
          <h1 className="mt-1 text-lg font-bold text-gray-900">Questions &amp; Answers</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">
        {tender.qanda_deadline && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              qandaOpen
                ? "border-blue-100 bg-blue-50 text-blue-800"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {qandaOpen ? (
              <>Q&amp;A closes on <strong>{fmtDate(tender.qanda_deadline)}</strong>. Answers are published to all bidders.</>
            ) : (
              <>Q&amp;A closed on {fmtDate(tender.qanda_deadline)}.</>
            )}
          </div>
        )}

        <QandAContractorPanel
          tenderId={tenderId}
          canPost={canPost}
          isLoggedIn={!!session?.user}
          userRole={isContractor ? "CONTRACTOR" : (session?.user ? "OTHER" : null)}
          initialQuestions={initialQuestions}
          myPendingQuestions={pendingList}
        />
      </div>
    </div>
  );
}
