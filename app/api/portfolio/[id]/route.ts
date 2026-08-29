import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const { id } = await params;
    const portfolioId = parseInt(id, 10);
    if (isNaN(portfolioId)) throw notFound("Portfolio project");

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const project = await prisma.bidPortfolioProject.findFirst({
      where: { id: portfolioId, user_id: bidUser.id },
      select: { id: true, source: true },
    });
    if (!project) throw notFound("Portfolio project");

    if (project.source !== "SELF_REPORTED") {
      throw forbidden();
    }

    await prisma.bidPortfolioProject.delete({ where: { id: portfolioId } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
