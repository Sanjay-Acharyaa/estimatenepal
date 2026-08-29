import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

const putSchema = z.object({
  title: z.string().min(3).max(300).optional(),
  description: z.string().min(10).max(5000).optional(),
  district: z.string().min(1).max(100).optional(),
  location_detail: z.string().max(500).nullable().optional(),
  tender_type: z.enum(["PUBLIC", "INVITATION_ONLY"]).optional(),
  bid_deadline: z.string().datetime().optional(),
  qanda_deadline: z.string().datetime().nullable().optional(),
  estimated_value: z.number().positive().nullable().optional(),
  site_visit_required: z.boolean().optional(),
  site_visit_scheduled_at: z.string().datetime().nullable().optional(),
  site_visit_location: z.string().max(500).nullable().optional(),
  quantity_visibility: z.enum(["HIDDEN", "VISIBLE"]).optional(),
  show_bidder_count: z.boolean().optional(),
  show_estimated_value_on_card: z.boolean().optional(),
  show_client_identity_on_card: z.boolean().optional(),
  bid_security_required: z.boolean().optional(),
  bid_security_percentage: z.number().min(0).max(100).optional(),
  instructions_to_bidders: z.string().max(5000).nullable().optional(),
});

const TENDER_SELECT = {
  id: true,
  reference_number: true,
  title: true,
  description: true,
  district: true,
  location_detail: true,
  tender_type: true,
  status: true,
  bid_deadline: true,
  qanda_deadline: true,
  estimated_value: true,
  site_visit_required: true,
  site_visit_scheduled_at: true,
  site_visit_location: true,
  quantity_visibility: true,
  show_bidder_count: true,
  show_estimated_value_on_card: true,
  show_client_identity_on_card: true,
  bid_security_required: true,
  bid_security_percentage: true,
  require_rtb_approval: true,
  vat_percentage: true,
  contingency_percentage_default: true,
  instructions_to_bidders: true,
  client_user_id: true,
  estimation_project_id: true,
  created_at: true,
  updated_at: true,
  boqChapters: {
    orderBy: { sort_order: "asc" as const },
    select: {
      id: true,
      title: true,
      level: true,
      sort_order: true,
      items: {
        orderBy: { sort_order: "asc" as const },
        select: {
          id: true,
          description: true,
          unit: true,
          client_quantity: true,
          sort_order: true,
        },
      },
    },
  },
} as const;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      select: TENDER_SELECT,
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    // Public tenders visible to all; DRAFT only visible to owner
    if (tender.status === "DRAFT") {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

      const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
      if (!procurementRoles.includes("CLIENT")) {
        return apiError("FORBIDDEN", "Access denied.", 403);
      }
      const bidUser = await getOrCreateBidUser(
        token.email as string,
        token.name as string,
        procurementRoles
      );
      if (tender.client_user_id !== bidUser.id) {
        return apiError("FORBIDDEN", "Access denied.", 403);
      }
    }

    return NextResponse.json({ tender });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can edit tenders.", 403);
    }

    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const existing = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, status: true },
    });
    if (!existing) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (existing.status !== "DRAFT") {
      return apiError("CONFLICT", "Only DRAFT tenders can be edited.", 409);
    }

    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.district !== undefined) updateData.district = data.district;
    if (data.location_detail !== undefined) updateData.location_detail = data.location_detail;
    if (data.tender_type !== undefined) updateData.tender_type = data.tender_type;
    if (data.bid_deadline !== undefined) updateData.bid_deadline = new Date(data.bid_deadline);
    if (data.qanda_deadline !== undefined)
      updateData.qanda_deadline = data.qanda_deadline ? new Date(data.qanda_deadline) : null;
    if (data.estimated_value !== undefined) updateData.estimated_value = data.estimated_value;
    if (data.site_visit_required !== undefined) updateData.site_visit_required = data.site_visit_required;
    if (data.site_visit_scheduled_at !== undefined)
      updateData.site_visit_scheduled_at = data.site_visit_scheduled_at
        ? new Date(data.site_visit_scheduled_at)
        : null;
    if (data.site_visit_location !== undefined) updateData.site_visit_location = data.site_visit_location;
    if (data.quantity_visibility !== undefined) updateData.quantity_visibility = data.quantity_visibility;
    if (data.show_bidder_count !== undefined) updateData.show_bidder_count = data.show_bidder_count;
    if (data.show_estimated_value_on_card !== undefined)
      updateData.show_estimated_value_on_card = data.show_estimated_value_on_card;
    if (data.show_client_identity_on_card !== undefined)
      updateData.show_client_identity_on_card = data.show_client_identity_on_card;
    if (data.bid_security_required !== undefined) updateData.bid_security_required = data.bid_security_required;
    if (data.bid_security_percentage !== undefined)
      updateData.bid_security_percentage = data.bid_security_percentage;
    if (data.instructions_to_bidders !== undefined)
      updateData.instructions_to_bidders = data.instructions_to_bidders;

    const updated = await prisma.tender.update({
      where: { id: tenderId },
      data: updateData,
      select: TENDER_SELECT,
    });

    return NextResponse.json({ tender: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
