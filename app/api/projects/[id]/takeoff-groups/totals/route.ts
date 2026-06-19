import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    // Fetch all groups (need type + additionalParams for formula filtering)
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id },
      select: { id: true, type: true, additionalParams: true },
    });

    // Fetch all items across all pages for this project
    const items = await prisma.takeoffItem.findMany({
      where: { group: { projectId: params.id } },
      select: { groupId: true, rawQuantity: true, unit: true, shapeType: true },
    });

    const groupMap = new Map(groups.map(g => [g.id, g]));
    const totals: Record<string, { rawQty: number; unit: string; count: number }> = {};

    for (const item of items) {
      if (!item.groupId) continue;
      const grp = groupMap.get(item.groupId);
      if (!totals[item.groupId]) totals[item.groupId] = { rawQty: 0, unit: item.unit, count: 0 };
      totals[item.groupId].count++;

      if (grp?.type === "VOLUME") {
        const ap = grp.additionalParams as { volumeMethod?: string } | null;
        const method = ap?.volumeMethod ?? "area_x_h";
        const isLengthShape = item.shapeType === "POLYLINE" || item.shapeType === "ARC" || item.shapeType === null;
        const isAreaShape = item.shapeType === "RECTANGLE" || item.shapeType === "CIRCLE" || item.shapeType === "POLYGON";
        if ((method === "lbh" && isLengthShape) || (method !== "lbh" && isAreaShape)) {
          totals[item.groupId].rawQty += item.rawQuantity;
        }
      } else {
        totals[item.groupId].rawQty += item.rawQuantity;
      }
    }

    return NextResponse.json(totals);
  } catch (err) {
    return handleApiError(err);
  }
}
