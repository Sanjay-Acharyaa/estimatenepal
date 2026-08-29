import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/security";

const schema = z.object({
  reason: z.string().min(5).max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.isSuperAdmin) return apiError("UNAUTHORIZED", "Superadmin only.", 401);

    const docId = parseInt(params.id, 10);
    if (isNaN(docId)) return apiError("VALIDATION_ERROR", "Invalid document ID.", 400);

    let body: unknown;
    try { body = await req.json(); } catch {
      return apiError("VALIDATION_ERROR", "Invalid JSON.", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "A rejection reason (5–1000 chars) is required.", 400);
    }

    const doc = await prisma.bidVerificationDocument.findUnique({
      where: { id: docId },
      select: { id: true, status: true },
    });

    if (!doc) return apiError("NOT_FOUND", "Document not found.", 404);
    if (doc.status !== "PENDING") return apiError("CONFLICT", "Document has already been reviewed.", 409);

    await prisma.bidVerificationDocument.update({
      where: { id: docId },
      data: {
        status: "REJECTED",
        rejectionReason: parsed.data.reason,
        reviewedByAdminId: token.id as string,
        reviewedAt: new Date(),
      },
    });

    appendAuditLog({
      orgId: (token.orgId as string) ?? "SYSTEM",
      userId: token.id as string,
      event: "verification_document.rejected",
      resourceId: String(docId),
      meta: { reason: parsed.data.reason } as any,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
