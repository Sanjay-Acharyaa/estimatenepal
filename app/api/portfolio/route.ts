import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

const CURRENT_YEAR = new Date().getFullYear();

const postSchema = z.object({
  project_name: z.string().min(2).max(200).trim(),
  client_type: z.enum(["GOVERNMENT", "PRIVATE", "NGO", "RESIDENTIAL"]),
  contract_value_range: z.enum([
    "BELOW_1M", "M1_TO_5M", "M5_TO_25M", "M25_TO_100M", "M100_TO_500M", "ABOVE_500M",
  ]),
  year_of_completion: z.number().int().min(1950).max(CURRENT_YEAR),
  role: z.enum(["MAIN_CONTRACTOR", "SUB_CONTRACTOR", "JOINT_VENTURE"]),
  description: z.string().max(1000).optional(),
});

const PROJECT_SELECT = {
  id: true,
  project_name: true,
  client_type: true,
  contract_value_range: true,
  year_of_completion: true,
  role: true,
  description: true,
  source: true,
  related_tender_id: true,
  created_at: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const projects = await prisma.bidPortfolioProject.findMany({
      where: { user_id: bidUser.id },
      orderBy: { year_of_completion: "desc" },
      select: PROJECT_SELECT,
    });

    return NextResponse.json({ projects });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) throw forbidden();

    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const body = await req.json().catch(() => null);
    if (!body) return apiError("VALIDATION_ERROR", "Invalid JSON.", 400);

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const { project_name, client_type, contract_value_range, year_of_completion, role, description } = parsed.data;

    const project = await prisma.bidPortfolioProject.create({
      data: {
        user_id: bidUser.id,
        project_name,
        client_type,
        contract_value_range,
        year_of_completion,
        role,
        description: description ?? null,
        source: "SELF_REPORTED",
      },
      select: PROJECT_SELECT,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
