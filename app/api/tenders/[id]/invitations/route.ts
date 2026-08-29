import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

const postSchema = z
  .object({
    contractor_user_id: z.number().int().positive().optional(),
    contractor_email: z.string().email().max(255).optional(),
  })
  .refine(
    (d) =>
      (d.contractor_user_id !== undefined) !== (d.contractor_email !== undefined),
    { message: "Provide exactly one of contractor_user_id or contractor_email." }
  );

const ACTIVE_STATUSES = ["PENDING", "ACCEPTED"] as const;

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can view tender invitations.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const invitations = await prisma.bidTenderInvitation.findMany({
      where: { tender_id: tenderId },
      orderBy: { invited_at: "desc" },
      select: {
        id: true,
        contractor_user_id: true,
        contractor_email: true,
        status: true,
        invited_at: true,
        responded_at: true,
        contractor: { select: { full_name: true } },
      },
    });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        contractor_user_id: inv.contractor_user_id,
        contractor_email: inv.contractor_email,
        contractor_name: inv.contractor?.full_name ?? null,
        status: inv.status,
        invited_at: inv.invited_at,
        responded_at: inv.responded_at,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can invite contractors.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, status: true, title: true, bid_deadline: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (tender.status !== "PUBLISHED") {
      return apiError("CONFLICT", "Contractors can only be invited after the tender is published.", 409);
    }

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const data = parsed.data;
    let contractorUserId: number | null = null;
    let contractorEmail: string;

    if (data.contractor_user_id !== undefined) {
      const contractor = await prisma.bidUser.findUnique({
        where: { id: data.contractor_user_id },
        select: { id: true, email: true, role: true, status: true },
      });

      if (!contractor) return apiError("NOT_FOUND", "Contractor not found.", 404);
      if (contractor.role !== "CONTRACTOR") {
        return apiError("VALIDATION_ERROR", "The specified user is not a contractor.", 422);
      }
      if (contractor.status !== "ACTIVE") {
        return apiError("VALIDATION_ERROR", "This contractor account is not active.", 422);
      }

      const duplicate = await prisma.bidTenderInvitation.findFirst({
        where: { tender_id: tenderId, contractor_user_id: contractor.id, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true, status: true },
      });
      if (duplicate) {
        return apiError(
          "CONFLICT",
          duplicate.status === "ACCEPTED"
            ? "This contractor has already accepted an invitation."
            : "This contractor has already been invited.",
          409
        );
      }

      contractorUserId = contractor.id;
      contractorEmail = contractor.email;
    } else {
      contractorEmail = data.contractor_email!.toLowerCase();

      const existingUser = await prisma.bidUser.findUnique({
        where: { email: contractorEmail },
        select: { id: true, role: true, status: true },
      });

      if (existingUser) {
        if (existingUser.role !== "CONTRACTOR") {
          return apiError("VALIDATION_ERROR", "A user with this email exists but is not a contractor.", 422);
        }
        contractorUserId = existingUser.id;

        const duplicate = await prisma.bidTenderInvitation.findFirst({
          where: { tender_id: tenderId, contractor_user_id: existingUser.id, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true, status: true },
        });
        if (duplicate) {
          return apiError(
            "CONFLICT",
            duplicate.status === "ACCEPTED"
              ? "This contractor has already accepted an invitation."
              : "This contractor has already been invited.",
            409
          );
        }
      } else {
        const duplicate = await prisma.bidTenderInvitation.findFirst({
          where: { tender_id: tenderId, contractor_email: contractorEmail, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true },
        });
        if (duplicate) {
          return apiError("CONFLICT", "This email address has already been invited.", 409);
        }
      }
    }

    const invitation = await prisma.bidTenderInvitation.create({
      data: { tender_id: tenderId, contractor_user_id: contractorUserId, contractor_email: contractorEmail, status: "PENDING" },
      select: { id: true, contractor_user_id: true, contractor_email: true, status: true, invited_at: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    const deadlineStr = tender.bid_deadline
      ? new Date(tender.bid_deadline).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "—";

    try {
      await sendEmail({
        to: contractorEmail,
        subject: `You have been invited to bid on: ${tender.title}`,
        html: `<p>You have been invited by ${token.name ?? "a client"} to submit a bid for <strong>${tender.title}</strong>.</p>
<p>Bid deadline: <strong>${deadlineStr}</strong></p>
<p><a href="${appUrl}/tenders/${tenderId}/invitations">View invitation</a></p>`,
      });
    } catch {
      await prisma.bidTenderInvitation.delete({ where: { id: invitation.id } }).catch(() => {});
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Invitation created but email could not be sent. Please try again." } },
        { status: 500 }
      );
    }

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
