import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/security";
import { dispatchUserNotification } from "@/lib/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.isSuperAdmin) return apiError("UNAUTHORIZED", "Superadmin only.", 401);

    const docId = parseInt(params.id, 10);
    if (isNaN(docId)) return apiError("VALIDATION_ERROR", "Invalid document ID.", 400);

    const doc = await prisma.bidVerificationDocument.findUnique({
      where: { id: docId },
      select: { id: true, status: true, userId: true },
    });

    if (!doc) return apiError("NOT_FOUND", "Document not found.", 404);
    if (doc.status !== "PENDING") return apiError("CONFLICT", "Document has already been reviewed.", 409);

    await prisma.bidVerificationDocument.update({
      where: { id: docId },
      data: {
        status: "APPROVED",
        reviewedByAdminId: token.id as string,
        reviewedAt: new Date(),
      },
    });

    appendAuditLog({
      orgId: (token.orgId as string) ?? "SYSTEM",
      userId: token.id as string,
      event: "verification_document.approved",
      resourceId: String(docId),
      meta: {} as any,
      ipAddress: getClientIp(req),
    });

    dispatchUserNotification(doc.userId, "doc_approved", {
      message: "Your verification document has been approved.",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
