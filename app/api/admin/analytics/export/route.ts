export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/errors";

const LT = "loadtest.estimatenepal.local";

function escape(v: string | null | undefined): string {
  if (v == null) return "";
  // CSV injection guard: prefix cells that open with a formula character
  let s = /^[=+\-@\t\r]/.test(String(v)) ? " " + String(v) : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(c => escape(c == null ? "" : String(c))).join(",");
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const type = req.nextUrl.searchParams.get("type") ?? "orgs";

    if (type === "orgs") {
      const orgs = await prisma.org.findMany({
        where: { users: { some: { isSuperAdmin: false, NOT: { email: { contains: LT } } } } },
        include: {
          _count: { select: { users: true, projects: true } },
          users: {
            where: { role: "OWNER", isSuperAdmin: false },
            select: { name: true, email: true, phone: true, createdAt: true, lastLoginAt: true, referralSource: true, referralMedium: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const headers = ["Org Name", "Plan Tier", "Plan", "Trial Ends", "Users", "Projects", "Owner Name", "Owner Email", "Owner Phone", "Signup Date", "Last Login", "UTM Source", "UTM Medium", "Churn Reason"];
      const lines = [
        headers.join(","),
        ...orgs.map(o => {
          const owner = o.users[0];
          return row([
            o.name,
            o.planTier,
            o.plan,
            o.trialEndsAt?.toISOString().split("T")[0] ?? "",
            o._count.users,
            o._count.projects,
            owner?.name ?? "",
            owner?.email ?? "",
            owner?.phone ?? "",
            owner?.createdAt?.toISOString().split("T")[0] ?? "",
            owner?.lastLoginAt?.toISOString().split("T")[0] ?? "",
            owner?.referralSource ?? "",
            owner?.referralMedium ?? "",
            o.churnReason ?? "",
          ]);
        }),
      ];

      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orgs-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (type === "emails") {
      const logs = await prisma.emailLog.findMany({
        orderBy: { sentAt: "desc" },
        take: 5000,
        select: {
          id: true, emailType: true, recipientEmail: true, subject: true,
          status: true, sentAt: true, deliveredAt: true, openedAt: true, clickedAt: true, errorMessage: true,
        },
      });

      const headers = ["ID", "Type", "Recipient", "Subject", "Status", "Sent At", "Delivered At", "Opened At", "Clicked At", "Error"];
      const lines = [
        headers.join(","),
        ...logs.map(l => row([
          l.id,
          l.emailType,
          l.recipientEmail,
          l.subject ?? "",
          l.status,
          l.sentAt?.toISOString() ?? "",
          l.deliveredAt?.toISOString() ?? "",
          l.openedAt?.toISOString() ?? "",
          l.clickedAt?.toISOString() ?? "",
          l.errorMessage ?? "",
        ])),
      ];

      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="emails-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
