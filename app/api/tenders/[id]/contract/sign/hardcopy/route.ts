import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { getUploadUrl, contractHardcopyKey } from "@/lib/upload";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can upload hardcopy contracts.", 403);
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
        contract: { select: { id: true, status: true } },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { bidder: { select: { full_name: true, email: true } } },
        },
      },
    });

    if (!tender || !tender.contract) return apiError("NOT_FOUND", "Contract not found.", 404);

    const key = contractHardcopyKey(tenderId);
    const uploadUrl = await getUploadUrl(key, "application/pdf");

    const now = new Date();
    await prisma.$transaction([
      prisma.bidContract.update({
        where: { id: tender.contract.id },
        data: {
          hardcopy_upload_url: key,
          hardcopy_marked_at: now,
          status: "SIGNED_HARDCOPY",
        },
      }),
      prisma.tender.update({
        where: { id: tenderId },
        data: { status: "CONTRACT_SIGNED" },
      }),
    ]);

    const contractor = tender.submissions[0]?.bidder;
    if (contractor) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      sendEmail({
        to: contractor.email,
        subject: `हस्तलिखित ठेक्का अपलोड: ${tender.title}`,
        html: `<p>प्रिय ${contractor.full_name},</p>
<p><strong>${tender.title}</strong> को हस्तलिखित ठेक्का अपलोड गरिएको छ।</p>
<p><a href="${appUrl}/tenders/${tenderId}/contract">ठेक्का हेर्नुहोस्</a></p>`,
      }).catch((err: unknown) => console.error("[hardcopy-email]", err));
    }

    return NextResponse.json({ upload_url: uploadUrl, key });
  } catch (err) {
    return handleApiError(err);
  }
}
