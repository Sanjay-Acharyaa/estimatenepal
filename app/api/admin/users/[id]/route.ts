export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";

const patchSchema = z.object({
  isTestAccount: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400);

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, name: true, email: true, isTestAccount: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
