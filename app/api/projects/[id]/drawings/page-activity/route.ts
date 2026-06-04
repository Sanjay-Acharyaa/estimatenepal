import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";

// Returns { [pageId]: { hasAnnotations: boolean, hasTakeoff: boolean } }
// Used to render page indicators in the drawing selector dropdown.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    // All pages in the project with their annotation/takeoff state
    const pages = await prisma.drawingPage.findMany({
      where: { drawing: { projectId: params.id, isLatest: true } },
      select: {
        id: true,
        annotationsJson: true,
        canvasJson: true,
        _count: { select: { takeoffItems: true } },
      },
    });

    const activity: Record<string, { hasAnnotations: boolean; hasTakeoff: boolean }> = {};

    for (const page of pages) {
      const hasAnnotations = (() => {
        if (!page.annotationsJson) return false;
        const a = page.annotationsJson as any;
        return Array.isArray(a.annotations) && a.annotations.length > 0;
      })();

      activity[page.id] = {
        hasAnnotations,
        hasTakeoff: (page as any)._count.takeoffItems > 0,
      };
    }

    return NextResponse.json(activity);
  } catch (err) {
    return handleApiError(err);
  }
}
