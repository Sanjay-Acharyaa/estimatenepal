export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { z } from "zod";
import type { PlanType } from "@prisma/client";

const schema = z.object({
  status:    z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  adminNote: z.string().max(500).optional(),
});

const PLAN_MAP: Record<string, { plan: PlanType; planTier: string }> = {
  "solo-pro": { plan: "PRO",        planTier: "SOLO" },
  "team-3":   { plan: "PRO",        planTier: "TEAM3" },
  "team-5":   { plan: "PRO",        planTier: "TEAM5" },
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await requireSuperAdmin(req);

    const body = schema.parse(await req.json());

    const payment = await prisma.pendingPayment.update({
      where: { id: params.id },
      data:  { status: body.status, adminNote: body.adminNote },
    });

    if (body.status === "VERIFIED") {
      const planInfo = PLAN_MAP[payment.planKey];
      if (planInfo) {
        const durationDays = payment.billing === "annual" ? 365 : 30;
        const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

        const user = await prisma.user.findUnique({
          where:  { email: payment.email },
          select: { orgId: true },
        });

        if (user?.orgId) {
          await prisma.org.update({
            where: { id: user.orgId },
            data: {
              plan:         planInfo.plan,
              planTier:     planInfo.planTier,
              trialEndsAt:  expiresAt,
            },
          });
        }
      }
    }

    return NextResponse.json(payment);
  } catch (err) {
    return handleApiError(err);
  }
}