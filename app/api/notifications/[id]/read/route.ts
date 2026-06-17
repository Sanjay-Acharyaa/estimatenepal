import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const notification = await prisma.notification.findUnique({ where: { id: params.id } });
    if (!notification) throw notFound("Notification");
    if (notification.userId !== token.id) throw forbidden();

    await prisma.notification.update({ where: { id: params.id }, data: { isRead: true } });
    return NextResponse.json({ message: "Marked as read." });
  } catch (err) {
    return handleApiError(err);
  }
}
