export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

// Unambiguous characters — excludes 0/O, 1/I to avoid confusion when read aloud
const COUPON_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCouponCode(): string {
  const bytes = crypto.randomBytes(8);
  const part = (start: number, n: number) =>
    Array.from({ length: n }, (_, i) => COUPON_CHARS[bytes[start + i] % COUPON_CHARS.length]).join("");
  return `NE-${part(0, 4)}-${part(4, 4)}`;
}

const createSchema = z.object({
  durationDays: z.number().int().min(1).max(365),
  count: z.number().int().min(1).max(50).default(1),
  planType: z.enum(["PRO", "ENTERPRISE"]).optional(),
  planTier: z.enum(["SOLO", "TEAM_3", "TEAM_5", "ENTERPRISE"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

    const [total, coupons] = await Promise.all([
      prisma.coupon.count(),
      prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
    ]);

    // Enrich redeemed coupons with org name
    const redeemedOrgIds = coupons.map(c => c.redeemedByOrg).filter(Boolean) as string[];
    const orgs = redeemedOrgIds.length
      ? await prisma.org.findMany({ where: { id: { in: redeemedOrgIds } }, select: { id: true, name: true } })
      : [];
    const orgMap = new Map(orgs.map(o => [o.id, o.name]));

    const enriched = coupons.map(c => ({
      ...c,
      redeemedByOrgName: c.redeemedByOrg ? (orgMap.get(c.redeemedByOrg) ?? c.redeemedByOrg) : null,
    }));

    return NextResponse.json(paginatedResponse(enriched, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const { durationDays, count, planType, planTier } = parsed.data;

    // Generate and insert coupons one at a time to handle the rare code collision gracefully
    const created = [];
    for (let i = 0; i < count; i++) {
      let code = generateCouponCode();
      let attempts = 0;
      // Retry up to 5 times on collision (astronomically unlikely but safe)
      while (attempts < 5) {
        try {
          const coupon = await prisma.coupon.create({
            data: { code, durationDays, planType, planTier, createdById: token.id as string },
          });
          created.push(coupon);
          break;
        } catch (e: any) {
          if (e?.code === "P2002") {
            code = generateCouponCode();
            attempts++;
          } else {
            throw e;
          }
        }
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
