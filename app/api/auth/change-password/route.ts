import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import bcrypt from "bcryptjs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain uppercase, lowercase and a number."
  ),
});

// POST /api/auth/change-password
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const user = await prisma.user.findUnique({ where: { id: token.id as string } });
    if (!user) throw unauthorized();

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return apiError("UNAUTHORIZED", "Current password is incorrect.", 401);

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });

    await appendAuditLog({
      orgId: user.orgId ?? "SYSTEM",
      userId: user.id,
      event: "user.password_changed",
      resourceId: user.id,
      meta: {} as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Password updated." });
  } catch (err) {
    return handleApiError(err);
  }
}
