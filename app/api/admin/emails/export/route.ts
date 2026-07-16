export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

function escapeCsv(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toRow(cells: (string | null | undefined)[]): string {
  return cells.map(escapeCsv).join(",");
}

const EXPORT_LIMIT = 5000;

// GET /api/admin/emails/export?type=activity|churn — download CSV
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const type = req.nextUrl.searchParams.get("type") ?? "activity";

    if (type === "churn") {
      const orgs = await prisma.org.findMany({
        where: { churnReason: { not: null } },
        orderBy: { trialEndsAt: "desc" },
        select: {
          id: true,
          name: true,
          churnReason: true,
          trialEndsAt: true,
          dataWipedAt: true,
          createdAt: true,
          users: {
            where: { role: "OWNER" },
            select: { email: true, name: true, lastLoginAt: true },
            take: 1,
          },
          _count: { select: { projects: true } },
        },
      });

      // L3: Include daysTrialUsed (engagement window) to match the churn table in the admin UI
      const header = toRow(["Org", "Owner", "Email", "Churn Reason", "Trial Ended", "Last Login", "Projects", "Days Trial Used", "Data Wiped"]);
      const rows = orgs.map((o) => {
        const owner = o.users[0];
        // C5 logic: use lastLoginAt - createdAt as true engagement window
        const daysUsed = owner?.lastLoginAt
          ? Math.max(0, Math.round((owner.lastLoginAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
          : o.trialEndsAt
          ? Math.round((o.trialEndsAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return toRow([
          o.name,
          owner?.name ?? "",
          owner?.email ?? "",
          o.churnReason,
          o.trialEndsAt?.toISOString() ?? "",
          owner?.lastLoginAt?.toISOString() ?? "",
          String(o._count.projects),
          daysUsed !== null ? String(daysUsed) : "",
          o.dataWipedAt?.toISOString() ?? "",
        ]);
      });

      const csv = [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="churn-feedback-${Date.now()}.csv"`,
        },
      });
    }

    // Default: activity log
    // M4: Count total before fetching so we can warn if truncated.
    const [totalCount, logs] = await Promise.all([
      prisma.emailLog.count({}),
      prisma.emailLog.findMany({
        orderBy: { sentAt: "desc" },
        take: EXPORT_LIMIT,
        // L2: Include resendEmailId for bounce investigation
        select: {
          id: true,
          orgId: true,
          recipientEmail: true,
          recipientName: true,
          emailType: true,
          subject: true,
          status: true,
          resendEmailId: true,
          sentAt: true,
        },
      }),
    ]);

    const isTruncated = totalCount > EXPORT_LIMIT;

    const orgIds = Array.from(new Set(logs.map((l) => l.orgId).filter(Boolean))) as string[];
    const orgMap = orgIds.length
      ? new Map(
          (await prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map(
            (o) => [o.id, o.name]
          )
        )
      : new Map<string, string>();

    // L2: Add resendEmailId column
    const header = toRow(["Org", "Recipient Name", "Recipient Email", "Email Type", "Subject", "Status", "Resend ID", "Sent At"]);
    const rows = logs.map((l) =>
      toRow([
        l.orgId ? (orgMap.get(l.orgId) ?? l.orgId) : "",
        l.recipientName,
        l.recipientEmail,
        l.emailType,
        l.subject,
        l.status,
        l.resendEmailId ?? "",
        l.sentAt.toISOString(),
      ])
    );

    const csv = [header, ...rows].join("\n");

    // M4: Show truncation in filename so admin knows data is incomplete
    const label = isTruncated
      ? `email-activity-${EXPORT_LIMIT}-of-${totalCount}-${Date.now()}`
      : `email-activity-${Date.now()}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${label}.csv"`,
        // M4: Expose full count for programmatic clients
        "X-Total-Count": String(totalCount),
        "X-Export-Limit": String(EXPORT_LIMIT),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
