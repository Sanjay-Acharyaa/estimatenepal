import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; negId: string }> };

async function resolveNegotiation(tenderId: number, negId: number, bidUser: { id: number }, isClient: boolean, clientUserId: number) {
  const neg = await prisma.bidNegotiation.findFirst({
    where: { id: negId, tender_id: tenderId },
    select: { id: true, bidder_user_id: true, status: true },
  });
  if (!neg) return null;
  const authorized = (isClient && clientUserId === bidUser.id) || (!isClient && neg.bidder_user_id === bidUser.id);
  if (!authorized) return null;
  return neg;
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    if (!isClient && !isContractor) return apiError("FORBIDDEN", "Access denied.", 403);

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, negId } = await params;
    const tenderId = parseInt(id, 10);
    const negotiationId = parseInt(negId, 10);
    if (isNaN(tenderId) || isNaN(negotiationId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: { client_user_id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const neg = await resolveNegotiation(tenderId, negotiationId, bidUser, isClient, tender.client_user_id);
    if (!neg) return apiError("NOT_FOUND", "Negotiation not found or access denied.", 404);

    const messages = await prisma.bidNegotiationMessage.findMany({
      where: { negotiation_id: negotiationId },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        sender_user_id: true,
        message_type: true,
        message_text: true,
        created_at: true,
        sender: { select: { full_name: true } },
      },
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        sender_user_id: m.sender_user_id,
        sender_name: m.sender.full_name,
        message_type: m.message_type,
        message_text: m.message_text,
        created_at: m.created_at,
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
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    if (!isClient && !isContractor) return apiError("FORBIDDEN", "Access denied.", 403);

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, negId } = await params;
    const tenderId = parseInt(id, 10);
    const negotiationId = parseInt(negId, 10);
    if (isNaN(tenderId) || isNaN(negotiationId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: { client_user_id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const neg = await resolveNegotiation(tenderId, negotiationId, bidUser, isClient, tender.client_user_id);
    if (!neg) return apiError("NOT_FOUND", "Negotiation not found or access denied.", 404);
    if (neg.status !== "ACTIVE") return apiError("CONFLICT", "This negotiation is closed.", 409);

    const body = await request.json();
    const { message_text } = body as { message_text?: string };
    if (!message_text?.trim()) {
      return apiError("VALIDATION_ERROR", "Message text is required.", 400);
    }

    const message = await prisma.bidNegotiationMessage.create({
      data: {
        negotiation_id: negotiationId,
        sender_user_id: bidUser.id,
        message_type: "TEXT",
        message_text: message_text.trim(),
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
