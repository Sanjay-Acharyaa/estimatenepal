import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";

function getNum(v: unknown): number {
  const n = Number(v); return isNaN(n) ? 0 : n;
}

function applyParams(
  rawQty: number,
  type: string,
  multiplier: number,
  ap: Record<string, unknown> | null
): number {
  if (type === "VOLUME") {
    const method = (ap?.volumeMethod as string) ?? "area_x_h";
    const h = getNum((ap?.height as any)?.ft) + getNum((ap?.height as any)?.in) / 12;
    const b = getNum((ap?.breadth as any)?.ft) + getNum((ap?.breadth as any)?.in) / 12;
    if (method === "lbh") return rawQty * b * h * multiplier;
    return rawQty * h * multiplier;
  }
  if (type === "VERTICAL_WALL_AREA") {
    const wallH = getNum((ap?.wall as any)?.heightFt) + getNum((ap?.wall as any)?.heightIn) / 12;
    return rawQty * wallH * multiplier;
  }
  if (type === "COUNT_BY_DISTANCE") {
    const spacing = getNum((ap?.spacing as any)?.ft) + getNum((ap?.spacing as any)?.in) / 12;
    if (!spacing) return 0;
    return Math.ceil(rawQty / spacing) * multiplier;
  }
  return rawQty * multiplier;
}

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

    // Load all groups with rate + items for this project
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, disciplineId: { not: null } },
      select: {
        id: true,
        disciplineId: true,
        type: true,
        multiplier: true,
        additionalParams: true,
        rateItem: { select: { baseRate: true } },
        items: { select: { rawQuantity: true, shapeType: true } },
      },
    });

    const totals: Record<string, number> = {};

    for (const g of groups) {
      if (!g.disciplineId || !g.rateItem) continue;
      const ap = g.additionalParams as Record<string, unknown> | null;
      const method = (ap?.volumeMethod as string) ?? "area_x_h";

      // Sum rawQuantity, filtering by shapeType for VOLUME
      let rawSum = 0;
      for (const item of g.items) {
        if (g.type === "VOLUME") {
          const isLength = item.shapeType === "POLYLINE" || item.shapeType === "ARC" || item.shapeType === null;
          const isArea = item.shapeType === "RECTANGLE" || item.shapeType === "CIRCLE";
          if ((method === "lbh" && isLength) || (method !== "lbh" && isArea)) {
            rawSum += item.rawQuantity;
          }
        } else {
          rawSum += item.rawQuantity;
        }
      }

      const qty = applyParams(rawSum, g.type, g.multiplier, ap);
      const amount = qty * g.rateItem.baseRate;
      totals[g.disciplineId] = (totals[g.disciplineId] ?? 0) + amount;
    }

    return NextResponse.json(totals);
  } catch (err) {
    return handleApiError(err);
  }
}
