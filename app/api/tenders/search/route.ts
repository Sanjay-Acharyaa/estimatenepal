import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const VALID_STATUSES = new Set([
  "DRAFT", "PUBLISHED", "UNDER_REVIEW", "NEGOTIATION",
  "AWARDED", "CONTRACT_DRAFT", "CONTRACT_SIGNED", "IN_PROGRESS",
  "COMPLETED", "CANCELLED",
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;

  const q = sp.get("q")?.trim() || undefined;
  const district = sp.get("district")?.trim() || undefined;
  const tenderTypeRaw = sp.get("tender_type");
  const statusRaw = sp.get("status") ?? "PUBLISHED";
  const minValueRaw = sp.get("min_value");
  const maxValueRaw = sp.get("max_value");
  const deadlineBefore = sp.get("deadline_before");
  const deadlineAfter = sp.get("deadline_after");
  const pageRaw = parseInt(sp.get("page") ?? "1", 10);
  const limitRaw = parseInt(sp.get("limit") ?? "12", 10);

  if (!VALID_STATUSES.has(statusRaw)) {
    return NextResponse.json(
      { error: { code: "INVALID_PARAM", message: "Invalid status value." } },
      { status: 400 }
    );
  }

  const page = Math.max(1, isNaN(pageRaw) ? 1 : pageRaw);
  const limit = Math.min(50, Math.max(1, isNaN(limitRaw) ? 12 : limitRaw));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { status: statusRaw };

  if (tenderTypeRaw === "PUBLIC" || tenderTypeRaw === "INVITATION_ONLY") {
    where.tender_type = tenderTypeRaw;
  }

  if (district) {
    where.district = { contains: district };
  }

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { reference_number: { contains: q } },
    ];
  }

  const minVal = minValueRaw && !isNaN(Number(minValueRaw)) ? Number(minValueRaw) : undefined;
  const maxVal = maxValueRaw && !isNaN(Number(maxValueRaw)) ? Number(maxValueRaw) : undefined;
  if (minVal !== undefined || maxVal !== undefined) {
    where.estimated_value = {
      ...(minVal !== undefined ? { gte: new Prisma.Decimal(minVal) } : {}),
      ...(maxVal !== undefined ? { lte: new Prisma.Decimal(maxVal) } : {}),
    };
  }

  const dlAfter = deadlineAfter ? new Date(deadlineAfter) : null;
  const dlBefore = deadlineBefore ? new Date(deadlineBefore) : null;
  const dlAfterValid = dlAfter && !isNaN(dlAfter.getTime());
  const dlBeforeValid = dlBefore && !isNaN(dlBefore.getTime());
  if (dlAfterValid || dlBeforeValid) {
    where.bid_deadline = {
      ...(dlAfterValid ? { gte: dlAfter as Date } : {}),
      ...(dlBeforeValid ? { lte: dlBefore as Date } : {}),
    };
  }

  const [tenders, total] = await Promise.all([
    prisma.tender.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      select: {
        id: true,
        title: true,
        reference_number: true,
        district: true,
        tender_type: true,
        status: true,
        bid_deadline: true,
        estimated_value: true,
        show_estimated_value_on_card: true,
        show_bidder_count: true,
      },
      orderBy: { bid_deadline: "asc" },
      skip,
      take: limit,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.tender.count({ where: where as any }),
  ]);

  return NextResponse.json({ tenders, total, page, limit });
}
