import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";

// GET /api/projects/[id]/rate-migration
// Returns { needsMigration, latestFY, projectFY } so the client can show a banner.
// "needsMigration" = project has ≥1 group linked to a DUDBC rate whose FY is older
// than the latest published DUDBC FY.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    // Find the latest published DUDBC fiscal year
    const latest = await prisma.rateItem.findFirst({
      where: { source: "DUDBC", isPublished: true },
      orderBy: { fiscalYear: "desc" },
      select: { fiscalYear: true },
    });

    if (!latest) return NextResponse.json({ needsMigration: false, latestFY: null, projectFY: null });

    // Find DUDBC rates linked to this project's groups
    const linkedGroups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, rateItemId: { not: null } },
      select: { rateItem: { select: { source: true, fiscalYear: true } } },
    });

    const dudbcFYs = linkedGroups
      .filter(g => g.rateItem?.source === "DUDBC")
      .map(g => g.rateItem!.fiscalYear);

    if (dudbcFYs.length === 0) return NextResponse.json({ needsMigration: false, latestFY: latest.fiscalYear, projectFY: null });

    // Use the oldest linked FY as the project's current FY
    const projectFY = dudbcFYs.sort()[0];
    const needsMigration = projectFY < latest.fiscalYear;

    return NextResponse.json({ needsMigration, latestFY: latest.fiscalYear, projectFY });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/projects/[id]/rate-migration
// Migrates all DUDBC-linked groups to matching rates in the latest published FY.
// Matches by code. Groups with no matching code in the new FY are left unchanged.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) {
      return apiError("FORBIDDEN", "Only admins can migrate rates.", 403);
    }

    // Get latest published FY
    const latest = await prisma.rateItem.findFirst({
      where: { source: "DUDBC", isPublished: true },
      orderBy: { fiscalYear: "desc" },
      select: { fiscalYear: true },
    });
    if (!latest) return NextResponse.json({ migrated: 0, unmatched: 0 });

    // Get all new FY rates indexed by code
    const newRates = await prisma.rateItem.findMany({
      where: { source: "DUDBC", fiscalYear: latest.fiscalYear, isPublished: true },
      select: { id: true, code: true },
    });
    const codeMap = new Map(newRates.map(r => [r.code, r.id]));

    // Get groups with DUDBC rates on older FYs
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, rateItemId: { not: null } },
      select: { id: true, rateItemId: true, rateItem: { select: { source: true, fiscalYear: true, code: true } } },
    });

    const toMigrate = groups.filter(
      g => g.rateItem?.source === "DUDBC" && g.rateItem.fiscalYear !== latest.fiscalYear
    );

    // Group by new rateItemId to batch into one updateMany per target rate
    const updateMap = new Map<string, string[]>();
    let unmatched = 0;

    for (const group of toMigrate) {
      const newId = codeMap.get(group.rateItem!.code);
      if (newId) {
        if (!updateMap.has(newId)) updateMap.set(newId, []);
        updateMap.get(newId)!.push(group.id);
      } else {
        unmatched++;
      }
    }

    const migrated = toMigrate.length - unmatched;

    if (updateMap.size > 0) {
      await prisma.$transaction(
        Array.from(updateMap.entries()).map(([newId, groupIds]) =>
          prisma.takeoffGroup.updateMany({
            where: { id: { in: groupIds } },
            data: { rateItemId: newId },
          })
        )
      );
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token!.id as string,
      event: "project.rate_migration",
      resourceId: params.id,
      meta: { migrated, unmatched, targetFY: latest.fiscalYear } as any,
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json({ migrated, unmatched, targetFY: latest.fiscalYear });
  } catch (err) {
    return handleApiError(err);
  }
}
