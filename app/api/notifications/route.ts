import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
    const onlyUnread = req.nextUrl.searchParams.get("unread") === "1";

    const where = {
      userId: token.id as string,
      ...(onlyUnread && { isRead: false }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(notifications, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}
