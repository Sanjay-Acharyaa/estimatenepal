import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";

const BATCH_ID_RE = /^[a-zA-Z0-9_-]+$/;

// DELETE /api/rates/delete-all?batchId=xxx   → delete all rates in a specific batch
// DELETE /api/rates/delete-all?batchId=none  → delete all unbatched (batchId IS NULL) custom rates
// DELETE /api/rates/delete-all               → delete ALL custom rates for this org

export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const batchIdParam = req.nextUrl.searchParams.get("batchId");

    // Validate batchId if provided (the sentinel "none" is also allowed)
    if (batchIdParam && batchIdParam !== "none") {
      if (!BATCH_ID_RE.test(batchIdParam) || batchIdParam.length > 128)
        return apiError("VALIDATION_ERROR", "Invalid batch ID.", 400);
    }

    let where: any = { orgId: token.orgId as string, source: "CUSTOM" };

    if (batchIdParam === "none") {
      where.batchId = null;
    } else if (batchIdParam) {
      where.batchId = batchIdParam;
    }

    const { count } = await prisma.rateItem.deleteMany({ where });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_items.bulk_deleted",
      meta: { count, batchId: batchIdParam ?? "all" } as any,
      ipAddress: ip,
    });

    return NextResponse.json({
      deleted: count,
      message: `${count} rate item${count !== 1 ? "s" : ""} deleted.`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
