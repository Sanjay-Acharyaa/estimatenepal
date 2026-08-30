import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can reject completion.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as { rejection_reason: string };
    if (!body.rejection_reason?.trim()) {
      return apiError("VALIDATION_ERROR", "rejection_reason is required.", 400);
    }

    const [maxRejectSetting, tender] = await Promise.all([
      prisma.bidPlatformSetting.findUnique({ where: { key: "completion_max_rejection_attempts" } }),
      prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: {
          id: true,
          title: true,
          reference_number: true,
          completionRequests: {
            where: { status: "PENDING" },
            orderBy: { created_at: "desc" },
            take: 1,
            select: { id: true, attempt_number: true },
          },
          submissions: {
            where: { status: "AWARDED" },
            take: 1,
            select: { bidder: { select: { full_name: true, email: true } } },
          },
        },
      }),
    ]);

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (!tender.completionRequests[0]) {
      return apiError("CONFLICT", "No pending completion request found.", 409);
    }

    const maxAttempts = parseInt(maxRejectSetting?.value ?? "3", 10);
    const pendingReq = tender.completionRequests[0];
    const now = new Date();

    const shouldEscalate = pendingReq.attempt_number >= maxAttempts;
    const newStatus = shouldEscalate ? "ESCALATED" : "REJECTED";

    await prisma.bidCompletionRequest.update({
      where: { id: pendingReq.id },
      data: {
        status: newStatus,
        rejected_at: now,
        rejection_reason: body.rejection_reason.trim(),
        ...(shouldEscalate ? { escalated_at: now } : {}),
      },
    });

    const contractor = tender.submissions[0]?.bidder;
    if (contractor) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      sendEmail({
        to: contractor.email,
        subject: `कार्य पूर्णता अस्वीकृत: ${tender.title}`,
        html: `<p>प्रिय ${contractor.full_name},</p>
<p><strong>${tender.title}</strong> को कार्य पूर्णता अनुरोध अस्वीकृत भयो।</p>
<p>कारण: ${body.rejection_reason}</p>
${shouldEscalate ? "<p><strong>यो विषय विवाद समाधानको लागि पठाइएको छ।</strong></p>" : ""}
<p><a href="${appUrl}/tenders/${tenderId}/completion">विवरण हेर्नुहोस्</a></p>`,
      }).catch((err: unknown) => console.error("[completion-reject-email]", err));
    }

    return NextResponse.json({ ok: true, status: newStatus, escalated: shouldEscalate });
  } catch (err) {
    return handleApiError(err);
  }
}
