import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const [templates, prefs] = await Promise.all([
      prisma.bidNotificationTemplate.findMany({
        where: { isActive: true, isDisableable: true },
        select: { eventKey: true, displayName: true },
        orderBy: { eventKey: "asc" },
      }),
      prisma.notificationPreference.findMany({
        where: { userId: token.id as string },
        select: { eventKey: true, emailEnabled: true, inAppEnabled: true },
      }),
    ]);

    const prefMap = new Map(prefs.map((p) => [p.eventKey, p]));

    const result = templates.map((t) => {
      const p = prefMap.get(t.eventKey);
      return {
        eventKey: t.eventKey,
        displayName: t.displayName,
        emailEnabled: p?.emailEnabled ?? true,
        inAppEnabled: p?.inAppEnabled ?? true,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  eventKey: z.string().min(1).max(191),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const { eventKey, emailEnabled, inAppEnabled } = parsed.data;
    const userId = token.id as string;

    await prisma.notificationPreference.upsert({
      where: { userId_eventKey: { userId, eventKey } },
      create: { userId, eventKey, emailEnabled: emailEnabled ?? true, inAppEnabled: inAppEnabled ?? true },
      update: {
        ...(emailEnabled !== undefined && { emailEnabled }),
        ...(inAppEnabled !== undefined && { inAppEnabled }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
