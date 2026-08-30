import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/errors";
import { getClientIp, checkApiRateLimit } from "@/lib/security";

type Params = { params: Promise<{ id: string }> };

async function requireOrgUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  if (!session.user.orgId) return null;
  return { userId: session.user.id, orgId: session.user.orgId };
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = await checkApiRateLimit(ip);
  if (rl) return rl;

  const actor = await requireOrgUser();
  if (!actor) return apiError("UNAUTHORIZED", "Org admin access required.", 401);

  const { id } = await params;
  const epId = parseInt(id, 10);
  if (isNaN(epId)) return apiError("NOT_FOUND", "Webhook not found.", 404);

  const endpoint = await prisma.bidWebhookEndpoint.findFirst({
    where: { id: epId, org_id: actor.orgId },
    select: { id: true },
  });
  if (!endpoint) return apiError("NOT_FOUND", "Webhook not found.", 404);

  const deliveries = await prisma.bidWebhookDelivery.findMany({
    where: { endpoint_id: epId },
    orderBy: { created_at: "desc" },
    take: 20,
    select: {
      id: true,
      event_type: true,
      status: true,
      attempt_count: true,
      last_attempted_at: true,
      response_status: true,
      created_at: true,
    },
  });

  return NextResponse.json({
    deliveries: deliveries.map((d) => ({
      id: d.id,
      event_type: d.event_type,
      status: d.status,
      attempt_count: d.attempt_count,
      last_attempted_at: d.last_attempted_at?.toISOString() ?? null,
      response_status: d.response_status,
      created_at: d.created_at.toISOString(),
    })),
  });
}
