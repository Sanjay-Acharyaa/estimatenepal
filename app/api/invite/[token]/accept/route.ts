import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { handleApiError, apiError, notFound, conflict } from "@/lib/errors";
import crypto from "crypto";

const acceptSchema = z.object({
  // For existing users: provide their userId (from session)
  userId: z.string().optional(),
  // For new users: provide registration details
  name: z.string().min(2).max(100).trim().optional(),
  password: z.string().min(8).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const invite = await prisma.orgInvite.findUnique({
      where: { token: params.token },
      include: { org: { select: { id: true, name: true } } },
    });

    if (!invite) throw notFound("Invite");
    if (invite.acceptedAt) throw conflict("This invitation has already been accepted.");
    if (invite.expiresAt < new Date()) return apiError("VALIDATION_ERROR", "This invitation has expired.", 400);

    const body = await req.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    let userId: string;

    if (parsed.data.userId) {
      // Existing logged-in user accepting the invite
      const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
      if (!user) throw notFound("User");
      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return apiError("VALIDATION_ERROR", "You must be logged in with the invited email address.", 400);
      }
      if (user.orgId) {
        return apiError("CONFLICT", "You already belong to an organisation.", 409);
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { orgId: invite.orgId, role: invite.role },
      });
      userId = user.id;
    } else {
      // New user registration via invite
      if (!parsed.data.name || !parsed.data.password) {
        return apiError("VALIDATION_ERROR", "Name and password are required for new accounts.", 400);
      }
      const existing = await prisma.user.findUnique({ where: { email: invite.email } });
      if (existing) {
        return apiError("CONFLICT", "An account with this email already exists. Please log in and accept the invite.", 409);
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      // Invited users are auto-verified (email ownership proven by invite link click)
      const newUser = await prisma.user.create({
        data: {
          name: parsed.data.name,
          email: invite.email,
          passwordHash,
          emailVerified: true,
          role: invite.role,
          orgId: invite.orgId,
        },
      });
      userId = newUser.id;
    }

    // Mark invite as accepted
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await appendAuditLog({
      orgId: invite.orgId,
      userId,
      event: "org_invite.accepted",
      resourceId: invite.id,
      meta: { email: invite.email, role: invite.role } as any,
    });

    return NextResponse.json({ message: "Invitation accepted. You can now log in." });
  } catch (err) {
    return handleApiError(err);
  }
}
