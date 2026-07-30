import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkUploadRateLimit, getClientIp } from "@/lib/security";
import { getUploadUrl } from "@/lib/upload";
import { getConfigNum } from "@/lib/config";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const schema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE, { message: "File must be ≤ 50 MB" }),
  contentType: z.literal("application/pdf"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkUploadRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    // Enforce per-plan storage limit — pick config key based on org's planTier
    const org = await prisma.org.findUnique({
      where: { id: project.orgId },
      select: { storageUsedBytes: true, planTier: true },
    });
    const STORAGE_CONFIG_KEY: Record<string, string> = {
      TRIAL: "storage_limit_solo_gb",
      SOLO: "storage_limit_solo_gb",
      TEAM_3: "storage_limit_team3_gb",
      TEAM_5: "storage_limit_team5_gb",
      ENTERPRISE: "storage_limit_enterprise_gb",
      ACADEMIC: "storage_limit_team3_gb",
    };
    const configKey = STORAGE_CONFIG_KEY[org?.planTier ?? "SOLO"] ?? "storage_limit_solo_gb";
    const storageLimitGb = await getConfigNum(configKey);
    const STORAGE_LIMIT = BigInt(storageLimitGb * 1024 * 1024 * 1024);
    if (org && org.storageUsedBytes + BigInt(parsed.data.fileSize) > STORAGE_LIMIT) {
      return apiError(
        "STORAGE_LIMIT_EXCEEDED",
        `Storage limit of ${storageLimitGb} GB reached. Delete old drawings or upgrade your plan.`,
        400
      );
    }

    const key = `drawings/${project.orgId}/${params.id}/${randomUUID()}.pdf`;
    const uploadUrl = await getUploadUrl(key, "application/pdf");

    return NextResponse.json({ uploadUrl, key }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
