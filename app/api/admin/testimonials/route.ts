import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";

// Superadmin: list all testimonials (pending approval shown first)
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

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
