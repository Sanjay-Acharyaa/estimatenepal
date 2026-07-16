export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

// Superadmin: approve or reject a testimonial
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const existing = await prisma.testimonial.findUnique({ where: { id: params.id } });
    if (!existing) throw notFound("Testimonial");

    const isApproved = parsed.data.action === "approve";
    await prisma.testimonial.update({
      where: { id: params.id },
      data: {
        isApproved,
        approvedAt: isApproved ? new Date() : null,
      },
    });

    // Bust the public testimonials cache so the change is live immediately
    redis.del("testimonials:approved").catch(() => {});

    return NextResponse.json({ message: `Testimonial ${parsed.data.action}d.` });
  } catch (err) {
    return handleApiError(err);
  }
}

// Superadmin: hard-delete a testimonial
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    await requireSuperAdmin(req);

    await prisma.testimonial.delete({ where: { id: params.id } }).catch(() => {});
    redis.del("testimonials:approved").catch(() => {});

    return NextResponse.json({ message: "Testimonial deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}