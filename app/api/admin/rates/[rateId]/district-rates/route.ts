import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { NEPAL_DISTRICTS } from "@/lib/districts";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({ where: { id: token.id as string }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const upsertSchema = z.object({
  rates: z.array(z.object({
    district: z.string().refine(d => (NEPAL_DISTRICTS as readonly string[]).includes(d), { message: "Invalid district name." }),
    rate: z.number().min(0),
  })),
});

// GET /api/admin/rates/[rateId]/district-rates
// Returns all 77 districts with their override rate (null if not set)
export async function GET(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");

    const existing = await prisma.districtRate.findMany({ where: { rateItemId: params.rateId } });
    const map = new Map(existing.map(d => [d.district, d.rate]));

    const result = NEPAL_DISTRICTS.map(district => ({
      district,
      rate: map.get(district) ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT /api/admin/rates/[rateId]/district-rates
// Bulk upsert district rates. Blocked if rate is published.
export async function PUT(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    if (rate.isPublished) return apiError("FORBIDDEN", "Published rates cannot be edited.", 403);

    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const districts = parsed.data.rates.map(r => r.district);
    await prisma.$transaction([
      prisma.districtRate.deleteMany({
        where: { rateItemId: params.rateId, district: { in: districts } },
      }),
      prisma.districtRate.createMany({
        data: parsed.data.rates.map(({ district, rate: distRate }) => ({
          rateItemId: params.rateId, district, rate: distRate,
        })),
      }),
    ]);

    await appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rate.district_rates_updated",
      resourceId: params.rateId,
      meta: { rateCode: rate.code, fiscalYear: rate.fiscalYear, count: parsed.data.rates.length } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ updated: parsed.data.rates.length });
  } catch (err) {
    return handleApiError(err);
  }
}
