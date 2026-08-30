import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");

    if (!isClient && !isContractor) {
      return apiError("FORBIDDEN", "Only clients or contractors can sign contracts.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const whereClause = isClient
      ? { tender_id: tenderId, tender: { client_user_id: bidUser.id } }
      : { tender_id: tenderId, winning_bid: { bidder_user_id: bidUser.id } };

    const contract = await prisma.bidContract.findFirst({
      where: whereClause,
      select: {
        id: true,
        status: true,
        client_signed_at: true,
        contractor_signed_at: true,
        tender: { select: { title: true } },
      },
    });

    if (!contract) return apiError("NOT_FOUND", "Contract not found.", 404);
    if (!["UNDER_REVIEW", "SIGNED_DIGITAL"].includes(contract.status)) {
      return apiError("CONFLICT", "Contract must be UNDER_REVIEW or SIGNED_DIGITAL to sign.", 409);
    }

    if (isClient && contract.client_signed_at) {
      return apiError("CONFLICT", "You have already signed this contract.", 409);
    }
    if (isContractor && contract.contractor_signed_at) {
      return apiError("CONFLICT", "You have already signed this contract.", 409);
    }

    const otp = randomInt(100000, 999999).toString();
    const hash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const updateData = isClient
      ? { client_otp_hash: hash, client_otp_expires_at: expiresAt }
      : { contractor_otp_hash: hash, contractor_otp_expires_at: expiresAt };

    await prisma.bidContract.update({ where: { id: contract.id }, data: updateData });

    await sendEmail({
      to: token.email as string,
      subject: `ठेक्का हस्ताक्षर OTP: ${contract.tender.title}`,
      html: `<p>प्रिय ${token.name as string},</p>
<p>ठेक्का हस्ताक्षरको लागि तपाईंको OTP कोड:</p>
<h2 style="letter-spacing:8px;font-size:32px;">${otp}</h2>
<p>यो कोड <strong>10 मिनेट</strong>सम्म मात्र वैध हुनेछ।</p>
<p>यदि तपाईंले यो अनुरोध गर्नुभएको छैन भने, कृपया तुरुन्त हामीलाई सम्पर्क गर्नुहोस्।</p>`,
    });

    return NextResponse.json({ ok: true, message: "OTP sent to your email." });
  } catch (err) {
    return handleApiError(err);
  }
}
