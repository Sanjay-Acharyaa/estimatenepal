import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import { sendEmail, inviteEmailHtml } from "@/lib/email";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import crypto from "crypto";

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);

    const where = { orgId: token.orgId as string };
    const [data, total] = await Promise.all([
      prisma.orgInvite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.orgInvite.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Check if email already belongs to a user in this org
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing && existing.orgId === (token.orgId as string)) {
      return apiError("CONFLICT", "This user is already a member of your organisation.", 409);
    }

    // Cancel any existing pending invite for this email+org
    await prisma.orgInvite.deleteMany({
      where: { orgId: token.orgId as string, email: parsed.data.email, acceptedAt: null },
    });

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    const invite = await prisma.orgInvite.create({
      data: {
        orgId: token.orgId as string,
        email: parsed.data.email,
        role: parsed.data.role,
        token: inviteToken,
        expiresAt,
      },
    });

    const org = await prisma.org.findUnique({ where: { id: token.orgId as string }, select: { name: true } });
    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${inviteToken}`;

    await sendEmail({
      to: parsed.data.email,
      subject: `You've been invited to join ${org?.name ?? "NepaliEstimate"}`,
      html: inviteEmailHtml(inviteUrl, org?.name ?? "NepaliEstimate", user.name, parsed.data.role),
    });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "org_invite.sent",
      resourceId: invite.id,
      meta: { email: parsed.data.email, role: parsed.data.role } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Invitation sent.", inviteId: invite.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
