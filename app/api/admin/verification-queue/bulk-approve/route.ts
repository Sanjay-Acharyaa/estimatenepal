import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { dispatchUserNotification } from "@/lib/notifications";

const bodySchema = z.object({
  doc_ids: z.array(z.number().int().positive()).min(1).max(50),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.isSuperAdmin) return apiError("UNAUTHORIZED", "Superadmin only.", 401);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.flatten(i => i.message).formErrors[0] ?? "Invalid input.", 400);
    }

    const { doc_ids } = parsed.data;

    const docs = await prisma.bidVerificationDocument.findMany({
      where: { id: { in: doc_ids }, status: "PENDING" },
      select: { id: true, userId: true },
    });

    const foundIds = new Set(docs.map((d) => d.id));
    const errors: { doc_id: number; message: string }[] = [];

    if (docs.length > 0) {
      await prisma.bidVerificationDocument.updateMany({
        where: { id: { in: docs.map((d) => d.id) } },
        data: {
          status: "APPROVED",
          reviewedByAdminId: token.id as string,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
    }

    for (const id of doc_ids) {
      if (!foundIds.has(id)) {
        errors.push({ doc_id: id, message: "Document not found or not pending." });
      }
    }

    for (const d of docs) {
      dispatchUserNotification(d.userId, "doc_approved", {
        message: "Your verification document has been approved.",
      });
    }

    return NextResponse.json({ approved: docs.map((d) => d.id), errors });
  } catch (err) {
    return handleApiError(err);
  }
}
