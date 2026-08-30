import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
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
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as { otp: string };
    if (!body.otp) return apiError("VALIDATION_ERROR", "otp is required.", 400);

    const contract = await prisma.bidContract.findFirst({
      where: isClient
        ? { tender_id: tenderId, tender: { client_user_id: bidUser.id } }
        : { tender_id: tenderId, winning_bid: { bidder_user_id: bidUser.id } },
      select: {
        id: true,
        status: true,
        client_otp_hash: true,
        client_otp_expires_at: true,
        client_signed_at: true,
        contractor_otp_hash: true,
        contractor_otp_expires_at: true,
        contractor_signed_at: true,
        tender: {
          select: {
            id: true,
            title: true,
            client: { select: { full_name: true, email: true } },
            submissions: {
              where: { status: "AWARDED" },
              take: 1,
              select: { bidder: { select: { full_name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!contract) return apiError("NOT_FOUND", "Contract not found.", 404);

    const incomingHash = createHash("sha256").update(body.otp).digest("hex");
    const now = new Date();

    if (isClient) {
      if (!contract.client_otp_hash || !contract.client_otp_expires_at) {
        return apiError("CONFLICT", "No OTP pending. Request a new OTP first.", 409);
      }
      if (contract.client_otp_expires_at < now) {
        return apiError("CONFLICT", "OTP has expired. Request a new OTP.", 409);
      }
      if (contract.client_otp_hash !== incomingHash) {
        return apiError("CONFLICT", "Invalid OTP.", 409);
      }
    } else {
      if (!contract.contractor_otp_hash || !contract.contractor_otp_expires_at) {
        return apiError("CONFLICT", "No OTP pending. Request a new OTP first.", 409);
      }
      if (contract.contractor_otp_expires_at < now) {
        return apiError("CONFLICT", "OTP has expired. Request a new OTP.", 409);
      }
      if (contract.contractor_otp_hash !== incomingHash) {
        return apiError("CONFLICT", "Invalid OTP.", 409);
      }
    }

    const signedAt = now;
    const updateData = isClient
      ? { client_signed_at: signedAt, client_otp_hash: null, client_otp_expires_at: null }
      : { contractor_signed_at: signedAt, contractor_otp_hash: null, contractor_otp_expires_at: null };

    const clientAlreadySigned = isContractor ? contract.client_signed_at : signedAt;
    const contractorAlreadySigned = isClient ? contract.contractor_signed_at : signedAt;
    const bothSigned = !!clientAlreadySigned && !!contractorAlreadySigned;

    const finalStatus = bothSigned ? "SIGNED_DIGITAL" : "UNDER_REVIEW";

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.bidContract.update({
        where: { id: contract.id },
        data: { ...updateData, status: finalStatus },
        select: { id: true, status: true, client_signed_at: true, contractor_signed_at: true },
      });

      if (bothSigned) {
        await tx.tender.update({
          where: { id: tenderId },
          data: { status: "CONTRACT_SIGNED" },
        });
      }

      return upd;
    });

    if (bothSigned) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const clientEmail = contract.tender.client.email;
      const contractorEmail = contract.tender.submissions[0]?.bidder.email;

      const subject = `ठेक्कामा दुवैतर्फको हस्ताक्षर सम्पन्न: ${contract.tender.title}`;
      const html = (name: string) => `<p>प्रिय ${name},</p>
<p><strong>${contract.tender.title}</strong> को ठेक्कामा दुवैतर्फको डिजिटल हस्ताक्षर सम्पन्न भयो।</p>
<p><a href="${appUrl}/tenders/${tenderId}/contract">ठेक्का हेर्नुहोस्</a></p>`;

      [
        { to: clientEmail, name: contract.tender.client.full_name },
        ...(contractorEmail ? [{ to: contractorEmail, name: contract.tender.submissions[0].bidder.full_name }] : []),
      ].forEach(({ to, name }) => {
        sendEmail({ to, subject, html: html(name) }).catch((err: unknown) => console.error("[otp-verify-email]", err));
      });
    }

    return NextResponse.json({ contract: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
