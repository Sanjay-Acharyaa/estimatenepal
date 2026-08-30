import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    const isConsultant = procurementRoles.includes("CONSULTANT");

    if (!isClient && !isContractor && !isConsultant) {
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
      select: { contract: { select: { id: true } } },
    });

    if (!tender?.contract) return apiError("NOT_FOUND", "Contract not found.", 404);

    const revisions = await prisma.bidContractRevision.findMany({
      where: { contract_id: tender.contract.id },
      orderBy: { revision_number: "desc" },
      select: {
        id: true,
        revision_number: true,
        submitted_at: true,
        submittedBy: { select: { full_name: true } },
      },
    });

    return NextResponse.json({ revisions });
  } catch (err) {
    return handleApiError(err);
  }
}
