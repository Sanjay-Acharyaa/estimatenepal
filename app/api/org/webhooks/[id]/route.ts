import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/errors";
import { getClientIp, checkApiRateLimit } from "@/lib/security";

const VALID_EVENTS = ["bid.submitted", "tender.awarded", "contract.signed", "snag.raised"] as const;

const putSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "No fields to update." });

type Params = { params: Promise<{ id: string }> };

async function requireOrgUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  if (!session.user.orgId) return null;
  return { userId: session.user.id, orgId: session.user.orgId };
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = await checkApiRateLimit(ip);
  if (rl) return rl;

  const actor = await requireOrgUser();
  if (!actor) return apiError("UNAUTHORIZED", "Org admin access required.", 401);

  const { id } = await params;
  const epId = parseInt(id, 10);
  if (isNaN(epId)) return apiError("NOT_FOUND", "Webhook not found.", 404);

  const existing = await prisma.bidWebhookEndpoint.findFirst({
    where: { id: epId, org_id: actor.orgId },
    select: { id: true },
  });
  if (!existing) return apiError("NOT_FOUND", "Webhook not found.", 404);

  let body: unknown;
  try { body = await request.json(); } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON.", 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  const { label, events, enabled } = parsed.data;
  const updated = await prisma.bidWebhookEndpoint.update({
    where: { id: epId },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(events !== undefined ? { events: events.join(",") } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    },
    select: { id: true, label: true, url: true, events: true, enabled: true },
  });

  return NextResponse.json({ endpoint: { ...updated, events: updated.events.split(",") } });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = await checkApiRateLimit(ip);
  if (rl) return rl;

  const actor = await requireOrgUser();
  if (!actor) return apiError("UNAUTHORIZED", "Org admin access required.", 401);

  const { id } = await params;
  const epId = parseInt(id, 10);
  if (isNaN(epId)) return apiError("NOT_FOUND", "Webhook not found.", 404);

  const existing = await prisma.bidWebhookEndpoint.findFirst({
    where: { id: epId, org_id: actor.orgId },
    select: { id: true },
  });
  if (!existing) return apiError("NOT_FOUND", "Webhook not found.", 404);

  await prisma.bidWebhookEndpoint.delete({ where: { id: epId } });
  return NextResponse.json({ deleted: true });
}
