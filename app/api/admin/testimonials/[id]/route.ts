import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

// Superadmin: approve or reject a testimonial
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

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
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    await prisma.testimonial.delete({ where: { id: params.id } }).catch(() => {});
    redis.del("testimonials:approved").catch(() => {});

    return NextResponse.json({ message: "Testimonial deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
