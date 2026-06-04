import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import bcrypt from "bcryptjs";

const profileSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain uppercase, lowercase and a number."
  ),
});

// GET /api/auth/profile
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { id: true, name: true, email: true, role: true, orgId: true, createdAt: true },
    });
    if (!user) throw unauthorized();

    return NextResponse.json(user);
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT /api/auth/profile — update name
export async function PUT(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const user = await prisma.user.update({
      where: { id: token.id as string },
      data: parsed.data,
      select: { id: true, name: true, email: true, role: true },
    });

    await appendAuditLog({
      orgId: user.id,
      userId: token.id as string,
      event: "user.profile_updated",
      resourceId: token.id as string,
      meta: { name: parsed.data.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json(user);
  } catch (err) {
    return handleApiError(err);
  }
}
