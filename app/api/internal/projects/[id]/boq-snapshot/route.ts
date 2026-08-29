import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBOQ } from "@/lib/boq";
import { apiError, handleApiError, notFound } from "@/lib/errors";

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;

// GET /api/internal/projects/[id]/boq-snapshot
// Called server-to-server by the Bidding platform to fetch BOQ structure for the
// "Create Tender" wizard. Requires:
//   Authorization: Bearer <INTERNAL_API_SECRET>
//   X-User-Email: <email of the Bidding user> — used to verify tenant ownership.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ── Auth: internal secret ─────────────────────────────────────────────────
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (!internalSecret) {
      return apiError("INTERNAL_ERROR", "Internal API not configured.", 503);
    }
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${internalSecret}`) {
      return apiError("UNAUTHORIZED", "Invalid internal secret.", 401);
    }

    // ── Validate project ID ───────────────────────────────────────────────────
    if (!PROJECT_ID_RE.test(params.id) || params.id.length > 128) {
      return apiError("VALIDATION_ERROR", "Invalid project ID.", 400);
    }

    // ── Tenant guard: verify caller's email belongs to the project's org ──────
    const callerEmail = req.headers.get("x-user-email")?.trim().toLowerCase();
    if (!callerEmail) {
      return apiError("UNAUTHORIZED", "X-User-Email header is required.", 401);
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, district: true, estimatedValue: true, orgId: true },
    });
    if (!project) throw notFound("Project");

    const caller = await prisma.user.findUnique({
      where: { email: callerEmail },
      select: { orgId: true },
    });
    if (!caller || caller.orgId !== project.orgId) {
      return apiError("FORBIDDEN", "You do not have access to this project.", 403);
    }

    // ── Generate BOQ ──────────────────────────────────────────────────────────
    const boq = await generateBOQ(params.id);

    const disciplines = boq.disciplines.map((disc) => ({
      name: disc.name,
      groups: disc.groups.map((grp) => ({
        name: grp.name,
        unit: grp.unit,
        totalQuantity: grp.totalQuantity,
      })),
    }));

    return NextResponse.json({
      id: project.id,
      name: project.name,
      district: project.district ?? "",
      estimatedValue: project.estimatedValue ?? null,
      disciplines,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
