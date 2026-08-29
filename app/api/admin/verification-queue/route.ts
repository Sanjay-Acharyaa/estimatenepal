import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/upload";
import { apiError, handleApiError } from "@/lib/errors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.isSuperAdmin) return apiError("UNAUTHORIZED", "Superadmin only.", 401);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      prisma.bidVerificationDocument.count({ where: { status: "PENDING" } }),
      prisma.bidVerificationDocument.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          documentType: true,
          status: true,
          fileUrl: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true, role: true } },
          org: { select: { id: true, name: true } },
        },
      }),
    ]);

    const docsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        let fileSignedUrl: string | null = null;
        try {
          fileSignedUrl = await getDownloadUrl(doc.fileUrl);
        } catch {
          // Storage may be unconfigured in dev; return null rather than crashing
        }
        return { ...doc, fileUrl: fileSignedUrl };
      })
    );

    return NextResponse.json({
      data: docsWithUrls,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
