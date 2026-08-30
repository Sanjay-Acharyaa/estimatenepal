import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";
import { emitProcurementNotification } from "@/lib/procurement-notify";
import { dispatchWebhook } from "@/lib/webhook-dispatch";

type Params = { params: Promise<{ id: string }> };

const SNAG_SELECT = {
  id: true,
  item_number: true,
  description: true,
  location_reference: true,
  priority: true,
  status: true,
  fixed_notes: true,
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  addedBy: { select: { full_name: true } },
};

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");

    if (!isClient && !isContractor) {
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: {
        id: tenderId,
        ...(isClient ? { client_user_id: bidUser.id } : {}),
        ...(isContractor ? { submissions: { some: { bidder_user_id: bidUser.id, status: "AWARDED" } } } : {}),
      },
      select: { id: true },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const snags = await prisma.bidSnagItem.findMany({
      where: { tender_id: tenderId },
      orderBy: { item_number: "asc" },
      select: SNAG_SELECT,
    });

    return NextResponse.json({ snags });
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
      return apiError("FORBIDDEN", "Only clients can add snag items.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as {
      description: string;
      location_reference?: string;
      priority?: string;
    };

    if (!body.description?.trim()) {
      return apiError("VALIDATION_ERROR", "description is required.", 400);
    }

    const VALID_PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return apiError("VALIDATION_ERROR", "Invalid priority.", 400);
    }

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id, status: "CONTRACT_SIGNED" },
      select: {
        id: true,
        title: true,
        reference_number: true,
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { bidder: { select: { full_name: true, email: true } } },
        },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found or not in CONTRACT_SIGNED status.", 404);

    const maxSnag = await prisma.bidSnagItem.findFirst({
      where: { tender_id: tenderId },
      orderBy: { item_number: "desc" },
      select: { item_number: true },
    });

    const snag = await prisma.bidSnagItem.create({
      data: {
        tender_id: tenderId,
        added_by_user_id: bidUser.id,
        item_number: (maxSnag?.item_number ?? 0) + 1,
        description: body.description.trim(),
        location_reference: body.location_reference?.trim() ?? null,
        priority: body.priority ?? "MEDIUM",
        status: "OPEN",
      },
      select: SNAG_SELECT,
    });

    const contractor = tender.submissions[0]?.bidder;
    if (contractor) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      sendEmail({
        to: contractor.email,
        subject: `नयाँ Snag थपियो: ${tender.title}`,
        html: `<p>प्रिय ${contractor.full_name},</p>
<p><strong>${tender.title}</strong> (${tender.reference_number}) मा नयाँ Snag item #{snag.item_number} थपिएको छ।</p>
<p>विवरण: ${snag.description}</p>
<p><a href="${appUrl}/tenders/${tenderId}/snags">Snag list हेर्नुहोस्</a></p>`,
      }).catch((err: unknown) => console.error("[snag-add-email]", err));

      // Real-time notification + webhook (fire-and-forget)
      ;(async () => {
        try {
          const contractorEstUser = await prisma.user.findUnique({
            where: { email: contractor.email },
            select: { id: true },
          });
          if (contractorEstUser) {
            emitProcurementNotification(contractorEstUser.id, "snag.raised", { tender_id: tenderId, snag_id: snag.id });
          }
          const clientEmail = token?.email as string | undefined;
          if (clientEmail) {
            const clientEstUser = await prisma.user.findUnique({
              where: { email: clientEmail },
              select: { orgId: true },
            });
            dispatchWebhook({ orgId: clientEstUser?.orgId, event: "snag.raised", data: { tender_id: tenderId, snag_id: snag.id } });
          }
        } catch (err) {
          console.error("[snag-notify]", err instanceof Error ? err.message : err);
        }
      })();
    }

    return NextResponse.json({ snag }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
