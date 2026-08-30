import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getClientIp, checkApiRateLimit } from "@/lib/security";

const bodySchema = z.object({
  passphrase: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Admin access required." } }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResult = await checkApiRateLimit(ip);
  if (rateLimitResult) return rateLimitResult;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Passphrase is required." } }, { status: 400 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Tender not found." } }, { status: 404 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { secondaryPassphraseHash: true, orgId: true },
  });

  if (!adminUser?.secondaryPassphraseHash) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No secondary passphrase configured. Set one in Admin > Security." } },
      { status: 404 }
    );
  }

  const match = await bcrypt.compare(parsed.data.passphrase, adminUser.secondaryPassphraseHash);
  if (!match) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Incorrect passphrase." } }, { status: 403 });
  }

  // Log every access in audit log (DoD requirement)
  prisma.auditLog.create({
    data: {
      orgId: adminUser.orgId ?? "",
      userId: session.user.id,
      event: "admin.confidential_bid_view",
      resourceId: String(tenderId),
      meta: { tender_id: tenderId },
      ipAddress: ip,
    },
  }).catch((err: Error) => console.error("[confidential] AuditLog failed:", err.message));

  const submissions = await prisma.bidSubmission.findMany({
    where: {
      tender_id: tenderId,
      status: { in: ["SUBMITTED", "SHORTLISTED", "FINAL_REVISED", "AWARDED", "NOT_AWARDED"] },
    },
    select: {
      id: true,
      status: true,
      submitted_at: true,
      grand_total_npr: true,
      bidder: {
        select: {
          full_name: true,
          organization: { select: { name: true } },
        },
      },
      lineItems: {
        select: {
          bidder_quantity: true,
          bidder_rate_npr: true,
          amount_npr: true,
          item_notes: true,
          boqItem: {
            select: {
              item_code: true,
              description: true,
              unit: true,
              client_quantity: true,
              chapter: { select: { title: true } },
            },
          },
        },
      },
    },
    orderBy: { submitted_at: "asc" },
  });

  const result = submissions.map(bid => ({
    id: bid.id,
    status: bid.status,
    submitted_at: bid.submitted_at,
    grand_total_npr: bid.grand_total_npr,
    bidder: {
      name: bid.bidder.full_name,
      org: bid.bidder.organization?.name ?? null,
    },
    items: bid.lineItems.map(li => ({
      chapter_title: li.boqItem?.chapter?.title ?? "",
      code: li.boqItem?.item_code ?? "",
      description: li.boqItem?.description ?? "",
      unit: li.boqItem?.unit ?? "",
      client_qty: li.boqItem?.client_quantity ?? null,
      qty: li.bidder_quantity,
      rate: li.bidder_rate_npr,
      amount: li.amount_npr,
    })),
  }));

  return NextResponse.json({ bids: result });
}
