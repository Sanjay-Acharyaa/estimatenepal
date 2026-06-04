import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, notFound, apiError } from "@/lib/errors";

// Public route — no auth required. Returns invite metadata for the accept page.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const invite = await prisma.orgInvite.findUnique({
      where: { token: params.token },
      include: { org: { select: { name: true } } },
    });

    if (!invite) throw notFound("Invite");
    if (invite.acceptedAt) return apiError("CONFLICT", "This invitation has already been accepted.", 409);
    if (invite.expiresAt < new Date()) return apiError("VALIDATION_ERROR", "This invitation has expired.", 400);

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      orgName: invite.org.name,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
