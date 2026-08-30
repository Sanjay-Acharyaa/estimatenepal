import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/errors";
import { encryptWebhookSecret } from "@/lib/webhook-crypto";
import { getClientIp, checkApiRateLimit } from "@/lib/security";

const VALID_EVENTS = ["bid.submitted", "tender.awarded", "contract.signed", "snag.raised"] as const;

const postSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url().max(2048),
  events: z.array(z.enum(VALID_EVENTS)).min(1, "Select at least one event."),
});

async function requireOrgUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  if (!session.user.orgId) return null;
  return { userId: session.user.id, orgId: session.user.orgId };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = await checkApiRateLimit(ip);
  if (rl) return rl;

  const actor = await requireOrgUser();
  if (!actor) return apiError("UNAUTHORIZED", "Org admin access required.", 401);

  const endpoints = await prisma.bidWebhookEndpoint.findMany({
    where: { org_id: actor.orgId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      label: true,
      url: true,
      events: true,
      enabled: true,
      created_at: true,
      deliveries: { select: { id: true }, orderBy: { created_at: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    endpoints: endpoints.map((ep) => ({
      id: ep.id,
      label: ep.label,
      url: ep.url,
      events: ep.events.split(","),
      enabled: ep.enabled,
      created_at: ep.created_at.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = await checkApiRateLimit(ip);
  if (rl) return rl;

  const actor = await requireOrgUser();
  if (!actor) return apiError("UNAUTHORIZED", "Org admin access required.", 401);

  let body: unknown;
  try { body = await request.json(); } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON.", 400);
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  const { label, url, events } = parsed.data;
  const plainSecret = randomBytes(32).toString("hex");

  const endpoint = await prisma.bidWebhookEndpoint.create({
    data: {
      org_id: actor.orgId,
      url,
      secret: encryptWebhookSecret(plainSecret),
      events: events.join(","),
      label,
      enabled: true,
      created_by_user_id: actor.userId,
    },
    select: { id: true, label: true, url: true, events: true, enabled: true, created_at: true },
  });

  return NextResponse.json(
    {
      endpoint: { ...endpoint, events: endpoint.events.split(","), created_at: endpoint.created_at.toISOString() },
      secret: plainSecret,
    },
    { status: 201 }
  );
}
