import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

async function getExpiryHours(): Promise<number> {
  const row = await prisma.bidPlatformSetting.findUnique({
    where: { key: "request_to_bid_expiry_hours" },
    select: { value: true },
  });
  const parsed = parseInt(row?.value ?? "", 10);
  return isNaN(parsed) ? 48 : parsed;
}

function computeExpiresAt(createdAt: Date, expiryHours: number): Date {
  return new Date(createdAt.getTime() + expiryHours * 3_600_000);
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR") && !procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Access denied.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const expiryHours = await getExpiryHours();

    if (procurementRoles.includes("CONTRACTOR")) {
      const bidRequest = await prisma.bidTenderRequestToBid.findFirst({
        where: { tender_id: tenderId, contractor_user_id: bidUser.id },
        orderBy: { created_at: "desc" },
        select: { id: true, tender_id: true, status: true, message: true, created_at: true },
      });

      if (!bidRequest) return apiError("NOT_FOUND", "No request found for this tender.", 404);

      return NextResponse.json({
        request: { ...bidRequest, expires_at: computeExpiresAt(bidRequest.created_at, expiryHours) },
      });
    }

    // CLIENT branch
    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const requests = await prisma.bidTenderRequestToBid.findMany({
      where: { tender_id: tenderId, status: { in: ["PENDING", "APPROVED"] } },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        tender_id: true,
        status: true,
        message: true,
        client_response_at: true,
        created_at: true,
        contractor: { select: { id: true, full_name: true } },
      },
    });

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, expires_at: computeExpiresAt(r.created_at, expiryHours) })),
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
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can submit a request to bid.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: { id: true, status: true, tender_type: true, require_rtb_approval: true },
    });

    if (!tender || tender.status !== "PUBLISHED") {
      return apiError("NOT_FOUND", "Tender not found.", 404);
    }

    if (tender.tender_type !== "PUBLIC") {
      return apiError("CONFLICT", "Request to Bid is only available for public tenders.", 409);
    }

    const existingInvitation = await prisma.bidTenderInvitation.findFirst({
      where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: { in: ["PENDING", "ACCEPTED"] } },
      select: { id: true, status: true },
    });

    if (existingInvitation) {
      const msg =
        existingInvitation.status === "ACCEPTED"
          ? "You already have access to this tender via an accepted invitation."
          : "You already have a pending invitation for this tender.";
      return apiError("CONFLICT", msg, 409);
    }

    const expiryHours = await getExpiryHours();

    const existingRequest = await prisma.bidTenderRequestToBid.findFirst({
      where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: { in: ["PENDING", "APPROVED"] } },
      select: { id: true, status: true, created_at: true },
    });

    if (existingRequest) {
      if (existingRequest.status === "APPROVED") {
        return apiError("CONFLICT", "Your request to bid has already been approved.", 409);
      }
      const expiresAt = computeExpiresAt(existingRequest.created_at, expiryHours);
      if (new Date() < expiresAt) {
        return apiError(
          "CONFLICT",
          "You already have a pending request for this tender. Please wait for the client to respond.",
          409
        );
      }
      await prisma.bidTenderRequestToBid.update({ where: { id: existingRequest.id }, data: { status: "EXPIRED" } });
    }

    const autoApprove = !tender.require_rtb_approval;
    const now = new Date();

    const newRequest = await prisma.bidTenderRequestToBid.create({
      data: {
        tender_id: tenderId,
        contractor_user_id: bidUser.id,
        status: autoApprove ? "APPROVED" : "PENDING",
        client_response_at: autoApprove ? now : null,
      },
      select: { id: true, tender_id: true, status: true, created_at: true },
    });

    return NextResponse.json(
      { request: { ...newRequest, expires_at: computeExpiresAt(newRequest.created_at, expiryHours) } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
