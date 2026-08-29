import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { uploadBuffer, verificationDocKey } from "@/lib/upload";
import { appendAuditLog } from "@/lib/audit";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOCUMENT_TYPES = [
  "COMPANY_REGISTRATION",
  "PAN",
  "CONTRACTOR_LICENSE",
  "LAND_OWNERSHIP",
  "OTHER",
] as const;

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const docs = await prisma.bidVerificationDocument.findMany({
      where: { userId: token.id as string },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ documents: docs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiError("VALIDATION_ERROR", "Request must be multipart/form-data.", 400);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return apiError("VALIDATION_ERROR", "Failed to parse form data.", 400);
    }

    const documentType = formData.get("document_type") as string | null;
    if (!documentType || !ALLOWED_DOCUMENT_TYPES.includes(documentType as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
      return apiError(
        "VALIDATION_ERROR",
        `document_type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`,
        400
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return apiError("VALIDATION_ERROR", "A file is required.", 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError("VALIDATION_ERROR", "File must be 10 MB or smaller.", 413);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!isPdfBuffer(buffer)) {
      return apiError("VALIDATION_ERROR", "Only PDF files are accepted.", 415);
    }

    const uuid = randomUUID();
    const key = verificationDocKey(token.id as string, uuid);

    try {
      await uploadBuffer(key, buffer, "application/pdf");
    } catch {
      return apiError("INTERNAL_ERROR", "File upload failed. Please try again.", 500);
    }

    const doc = await prisma.bidVerificationDocument.create({
      data: {
        userId: token.id as string,
        orgId: token.orgId as string | undefined,
        documentType: documentType as string,
        fileUrl: key,
        fileSizeBytes: BigInt(buffer.length),
        status: "PENDING",
      },
      select: { id: true, documentType: true, status: true, createdAt: true },
    });

    appendAuditLog({
      orgId: (token.orgId as string) ?? "SYSTEM",
      userId: token.id as string,
      event: "verification_document.uploaded",
      resourceId: String(doc.id),
      meta: { documentType } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
