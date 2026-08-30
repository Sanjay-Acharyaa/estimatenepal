import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [publishedCount, contractorCount, districts] = await Promise.all([
    prisma.tender.count({ where: { status: "PUBLISHED" } }),
    prisma.bidUser.count({ where: { role: "CONTRACTOR", status: "ACTIVE" } }),
    prisma.tender.findMany({
      where: { status: "PUBLISHED" },
      select: { district: true },
      distinct: ["district"],
    }),
  ]);

  return NextResponse.json({
    published_tenders: publishedCount,
    registered_contractors: contractorCount,
    districts_covered: districts.length,
  });
}
