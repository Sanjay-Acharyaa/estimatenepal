export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";

const VALID_PLANS = ["TRIAL", "SOLO", "TEAM_3", "TEAM_5", "ENTERPRISE", "ACADEMIC"] as const;

const schema = z.object({
  planTier: z.enum(VALID_PLANS),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid plan.", 400);

    const org = await prisma.org.findUnique({ where: { id: params.id } });
    if (!org) return apiError("NOT_FOUND", "Organisation not found.", 404);

    const updated = await prisma.org.update({
      where: { id: params.id },
      data: { planTier: parsed.data.planTier },
      select: { id: true, name: true, planTier: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}