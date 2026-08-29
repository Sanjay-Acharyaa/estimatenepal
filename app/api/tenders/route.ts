import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

const boqItemSchema = z.object({
  description: z.string().min(1).max(2000),
  unit: z.string().max(50),
  client_quantity: z.number().positive().optional(),
});

const boqChapterSchema = z.object({
  title: z.string().min(1).max(300),
  items: z.array(boqItemSchema).max(200).optional(),
});

const postSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().min(10).max(5000),
  district: z.string().min(1).max(100),
  location_detail: z.string().max(500).optional(),
  tender_type: z.enum(["PUBLIC", "INVITATION_ONLY"]),
  bid_deadline: z.string().datetime(),
  qanda_deadline: z.string().datetime().optional(),
  estimated_value: z.number().positive().optional(),
  site_visit_required: z.boolean().default(false),
  site_visit_scheduled_at: z.string().datetime().optional(),
  site_visit_location: z.string().max(500).optional(),
  quantity_visibility: z.enum(["HIDDEN", "VISIBLE"]).default("HIDDEN"),
  show_bidder_count: z.boolean().default(false),
  show_estimated_value_on_card: z.boolean().default(false),
  show_client_identity_on_card: z.boolean().default(true),
  bid_security_required: z.boolean().default(false),
  bid_security_percentage: z.number().min(0).max(100).default(0),
  instructions_to_bidders: z.string().max(5000).optional(),
  require_rtb_approval: z.boolean().default(false),
  estimation_project_id: z.string().max(191).optional(),
  boq_chapters: z.array(boqChapterSchema).max(20).optional(),
});

async function getSettingDecimal(key: string, fallback: number): Promise<number> {
  const row = await prisma.bidPlatformSetting.findUnique({ where: { key }, select: { value: true } });
  const parsed = parseFloat(row?.value ?? "");
  return isNaN(parsed) ? fallback : parsed;
}

async function generateReferenceNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.tender.count({
    where: { reference_number: { startsWith: `BID-${year}-` } },
  });
  const seq = String(count + 1).padStart(5, "0");
  return `BID-${year}-${seq}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can access this.", 403);
    }

    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const tenders = await prisma.tender.findMany({
      where: { client_user_id: bidUser.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        reference_number: true,
        title: true,
        district: true,
        tender_type: true,
        status: true,
        bid_deadline: true,
        created_at: true,
        updated_at: true,
      },
    });

    return NextResponse.json({ tenders });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can create tenders.", 403);
    }

    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const data = parsed.data;

    const [vatPct, contingencyPct] = await Promise.all([
      getSettingDecimal("vat_percentage", 13),
      getSettingDecimal("contingency_percentage_default", 5),
    ]);

    const tender = await prisma.$transaction(async (tx) => {
      const referenceNumber = await generateReferenceNumber(tx);

      const created = await tx.tender.create({
        data: {
          reference_number: referenceNumber,
          title: data.title,
          description: data.description,
          district: data.district,
          location_detail: data.location_detail ?? null,
          tender_type: data.tender_type,
          status: "DRAFT",
          bid_deadline: new Date(data.bid_deadline),
          qanda_deadline: data.qanda_deadline ? new Date(data.qanda_deadline) : null,
          estimated_value: data.estimated_value ?? null,
          site_visit_required: data.site_visit_required,
          site_visit_scheduled_at: data.site_visit_scheduled_at
            ? new Date(data.site_visit_scheduled_at)
            : null,
          site_visit_location: data.site_visit_location ?? null,
          quantity_visibility: data.quantity_visibility,
          show_bidder_count: data.show_bidder_count,
          show_estimated_value_on_card: data.show_estimated_value_on_card,
          show_client_identity_on_card: data.show_client_identity_on_card,
          bid_security_required: data.bid_security_required,
          bid_security_percentage: data.bid_security_percentage,
          require_rtb_approval: data.require_rtb_approval,
          vat_percentage: vatPct,
          contingency_percentage_default: contingencyPct,
          instructions_to_bidders: data.instructions_to_bidders ?? null,
          estimation_project_id: data.estimation_project_id ?? null,
          client_user_id: bidUser.id,
        },
        select: {
          id: true,
          reference_number: true,
          title: true,
          status: true,
          bid_deadline: true,
          created_at: true,
        },
      });

      if (data.boq_chapters && data.boq_chapters.length > 0) {
        for (let ci = 0; ci < data.boq_chapters.length; ci++) {
          const chap = data.boq_chapters[ci];
          const chapter = await tx.bidBoqChapter.create({
            data: {
              tender_id: created.id,
              title: chap.title,
              level: 1,
              sort_order: ci,
            },
            select: { id: true },
          });
          if (chap.items && chap.items.length > 0) {
            await tx.bidBoqItem.createMany({
              data: chap.items.map((item, ii) => ({
                tender_id: created.id,
                chapter_id: chapter.id,
                description: item.description,
                unit: item.unit,
                client_quantity: item.client_quantity ?? null,
                sort_order: ii,
              })),
            });
          }
        }
      }

      return created;
    });

    return NextResponse.json({ tender }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
