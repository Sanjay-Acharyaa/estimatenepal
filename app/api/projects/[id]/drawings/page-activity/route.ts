import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

// Returns { [pageId]: { hasAnnotations: boolean, hasTakeoff: boolean } }
// Used to render page indicators in the drawing selector dropdown.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    // All pages in the project with their annotation/takeoff state.
    // Uses the denormalized hasAnnotations flag — no JSON blob loading.
    const pages = await prisma.drawingPage.findMany({
      where: { drawing: { projectId: params.id, isLatest: true } },
      select: {
        id: true,
        hasAnnotations: true,
        _count: { select: { takeoffItems: true } },
      },
    });

    const activity: Record<string, { hasAnnotations: boolean; hasTakeoff: boolean }> = {};

    for (const page of pages) {
      activity[page.id] = {
        hasAnnotations: page.hasAnnotations,
        hasTakeoff: page._count.takeoffItems > 0,
      };
    }

    return NextResponse.json(activity);
  } catch (err) {
    return handleApiError(err);
  }
}
