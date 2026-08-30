import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

const CONTRACT_SELECT = {
  id: true,
  tender_id: true,
  loa_id: true,
  winning_bid_id: true,
  contract_text: true,
  price_escalation_type: true,
  price_escalation_trigger_percentage: true,
  completion_start_date: true,
  completion_end_date: true,
  mobilization_advance_percentage: true,
  retention_percentage: true,
  dlp_months: true,
  dlp_start_date: true,
  dlp_end_date: true,
  retention_status: true,
  status: true,
  contractor_signed_at: true,
  client_signed_at: true,
  hardcopy_upload_url: true,
  hardcopy_marked_at: true,
  pdf_url: true,
  current_draft_version: true,
  created_at: true,
  updated_at: true,
  comments: {
    orderBy: { created_at: "asc" as const },
    select: {
      id: true,
      clause_reference: true,
      comment_text: true,
      status: true,
      resolved_at: true,
      created_at: true,
      commenter: { select: { full_name: true } },
    },
  },
};

function buildContractPlaceholder(
  tenderTitle: string,
  tenderRef: string,
  clientName: string,
  contractorName: string,
  awardedAmount: string,
  defaultMobilization: string,
  defaultRetention: string,
  defaultDlp: string
): string {
  return `सम्झौता पत्र

सन्दर्भ: ${tenderRef}
परियोजना: ${tenderTitle}

यो सम्झौता पत्र निम्न दुई पक्षहरू बीच गरिएको हो:

पहिलो पक्ष (ग्राहक): ${clientName}
दोस्रो पक्ष (ठेकेदार): ${contractorName}

१. परियोजनाको विवरण
ठेकेदारले माथि उल्लिखित टेन्डर अन्तर्गत संलग्न बिल अफ क्वान्टिटीज (BOQ) मा उल्लिखित सम्पूर्ण कार्य सम्पन्न गर्नेछन्।

२. सम्झौता रकम
स्वीकृत बोलपत्र रकम: ${awardedAmount}

३. परियोजना समयसीमा
सुरुवात मिति: [ठेकेदारले भर्ने]
समाप्ति मिति: [ठेकेदारले भर्ने]

४. अग्रिम भुक्तानी (Mobilization Advance)
सम्झौता रकमको ${defaultMobilization}% (ब्याङ्क ग्यारेन्टी सहित)

५. प्रतिधारण रकम (Retention)
प्रत्येक बिलिङमा ${defaultRetention}% काटिनेछ।

६. Defect Liability Period (DLP)
कार्य पूर्ण भएको ${defaultDlp} महिनासम्म।

७. गुणस्तर र मापदण्ड
सम्पूर्ण कार्य स्वीकृत मापदण्ड तथा प्राविधिक विनिर्देशन अनुसार हुनेछ।

८. विवाद समाधान
कुनै विवाद उत्पन्न भएमा नेपालको प्रचलित कानूनबमोजिम समाधान गरिनेछ।

९. अन्य शर्तहरू
[ठेकेदारले थप शर्तहरू उल्लेख गर्न सक्नुहुन्छ]

यो सम्झौता दुवै पक्षको डिजिटल वा हस्तलिखित हस्ताक्षरद्वारा प्रभावकारी हुनेछ।`;
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can create contracts.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: {
        id: true,
        title: true,
        reference_number: true,
        status: true,
        awarded_bidder_id: true,
        awarded_amount_npr: true,
        client: { select: { full_name: true, email: true } },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { id: true, bidder_user_id: true, bidder: { select: { full_name: true, email: true } } },
        },
        contract: { select: { id: true } },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (tender.status !== "AWARDED") return apiError("CONFLICT", "Tender must be in AWARDED status.", 409);
    if (tender.contract) return apiError("CONFLICT", "Contract already exists for this tender.", 409);

    const awardedBid = tender.submissions[0];
    if (!awardedBid) return apiError("CONFLICT", "No awarded bid found.", 409);

    const [defaultMob, defaultRet, defaultDlp] = await Promise.all([
      prisma.bidPlatformSetting.findUnique({ where: { key: "contract_default_mobilization_percentage" } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "contract_default_retention_percentage" } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "contract_default_dlp_months" } }),
    ]);

    const mobPct = defaultMob?.value ?? "10";
    const retPct = defaultRet?.value ?? "5";
    const dlpMonths = defaultDlp?.value ?? "12";

    const awardedAmountStr = tender.awarded_amount_npr
      ? `NPR ${Number(tender.awarded_amount_npr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "[रकम उल्लेख गर्नुहोस्]";

    const contractText = buildContractPlaceholder(
      tender.title,
      tender.reference_number,
      tender.client.full_name,
      awardedBid.bidder.full_name,
      awardedAmountStr,
      mobPct,
      retPct,
      dlpMonths
    );

    const contract = await prisma.$transaction(async (tx) => {
      const loa = await tx.bidLetterOfAward.upsert({
        where: { tender_id: tenderId },
        update: {},
        create: { tender_id: tenderId, winning_bid_id: awardedBid.id },
      });

      const newContract = await tx.bidContract.create({
        data: {
          tender_id: tenderId,
          loa_id: loa.id,
          winning_bid_id: awardedBid.id,
          contract_text: contractText,
          mobilization_advance_percentage: parseFloat(mobPct),
          retention_percentage: parseFloat(retPct),
          dlp_months: parseInt(dlpMonths, 10),
          status: "DRAFT",
        },
        select: CONTRACT_SELECT,
      });

      await tx.bidContractRevision.create({
        data: {
          contract_id: newContract.id,
          revision_number: 1,
          content: contractText,
          submitted_by_user_id: bidUser.id,
        },
      });

      return newContract;
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    sendEmail({
      to: awardedBid.bidder.email,
      subject: `ठेक्का मस्यौदा तयार छ: ${tender.title}`,
      html: `<p>प्रिय ${awardedBid.bidder.full_name},</p>
<p><strong>${tender.title}</strong> (${tender.reference_number}) को लागि ठेक्का मस्यौदा तयार भएको छ। कृपया समीक्षा गर्नुहोस्।</p>
<p><a href="${appUrl}/tenders/${tenderId}/contract">ठेक्का हेर्नुहोस्</a></p>`,
    }).catch((err: unknown) => console.error("[contract-create-email]", err));

    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    const isConsultant = procurementRoles.includes("CONSULTANT");

    if (!isClient && !isContractor && !isConsultant) {
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const tender = await prisma.tender.findFirst({
      where: {
        id: tenderId,
        ...(isClient ? { client_user_id: bidUser.id } : {}),
        ...(isContractor ? { submissions: { some: { bidder_user_id: bidUser.id, status: "AWARDED" } } } : {}),
      },
      select: {
        id: true,
        contract: { select: CONTRACT_SELECT },
        awarded_bidder_id: true,
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Not found.", 404);
    if (!tender.contract) return apiError("NOT_FOUND", "No contract yet.", 404);

    return NextResponse.json({ contract: tender.contract });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can edit contracts.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as {
      contract_text?: string;
      completion_start_date?: string;
      completion_end_date?: string;
    };

    const contract = await prisma.bidContract.findFirst({
      where: { tender_id: tenderId, winning_bid: { bidder_user_id: bidUser.id } },
      select: { id: true, status: true, current_draft_version: true },
    });

    if (!contract) return apiError("NOT_FOUND", "Contract not found.", 404);
    if (contract.status !== "DRAFT") {
      return apiError("CONFLICT", "Contract can only be edited in DRAFT status.", 409);
    }

    const updateData: Record<string, unknown> = {};
    if (body.contract_text !== undefined) updateData.contract_text = body.contract_text;
    if (body.completion_start_date !== undefined) updateData.completion_start_date = body.completion_start_date ? new Date(body.completion_start_date) : null;
    if (body.completion_end_date !== undefined) updateData.completion_end_date = body.completion_end_date ? new Date(body.completion_end_date) : null;

    const updated = await prisma.bidContract.update({
      where: { id: contract.id },
      data: updateData,
      select: CONTRACT_SELECT,
    });

    return NextResponse.json({ contract: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
