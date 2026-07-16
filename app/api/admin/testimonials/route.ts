export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  // Re-verify in DB to guard against stale JWT with promoted isSuperAdmin=true
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

// Superadmin: list all testimonials (pending approval shown first)
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    await requireSuperAdmin(req);

    const testimonials = await prisma.testimonial.findMany({
      orderBy: [{ isApproved: "asc" }, { submittedAt: "desc" }],
      select: {
        id: true,
        authorName: true,
        authorRole: true,
        company: true,
        content: true,
        rating: true,
        isApproved: true,
        userId: true,
        submittedAt: true,
        approvedAt: true,
      },
    });

    return NextResponse.json(testimonials);
  } catch (err) {
    return handleApiError(err);
  }
}
