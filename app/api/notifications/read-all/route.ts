import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized } from "@/lib/errors";

export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    await prisma.notification.updateMany({
      where: { userId: token.id as string, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ message: "All notifications marked as read." });
  } catch (err) {
    return handleApiError(err);
  }
}
