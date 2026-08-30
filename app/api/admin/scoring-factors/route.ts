import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiError } from "@/lib/errors";

const WEIGHT_KEYS = ["scoring_weight_price", "scoring_weight_quantity", "outlier_flagging_threshold_percentage"] as const;

const patchSchema = z.object({
  scoring_weight_price: z.number().min(0).max(100).optional(),
  scoring_weight_quantity: z.number().min(0).max(100).optional(),
  outlier_flagging_threshold_percentage: z.number().min(0).max(100).optional(),
});

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!session.user.isSuperAdmin) return null;
  return session.user;
}

export async function GET(): Promise<NextResponse> {
  const user = await requireSuperAdmin();
  if (!user) return apiError("UNAUTHORIZED", "Admin access required.", 401);

  const rows = await prisma.bidPlatformSetting.findMany({
    where: { key: { in: [...WEIGHT_KEYS] } },
    select: { key: true, value: true },
  });

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const weightPrice = parseFloat(map["scoring_weight_price"] ?? "70");
  const weightQty = parseFloat(map["scoring_weight_quantity"] ?? "30");
  const outlier = parseFloat(map["outlier_flagging_threshold_percentage"] ?? "30");
  const weightSum = Math.round((weightPrice + weightQty) * 100) / 100;

  return NextResponse.json({ scoring_weight_price: weightPrice, scoring_weight_quantity: weightQty, outlier_flagging_threshold_percentage: outlier, weight_sum: weightSum });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await requireSuperAdmin();
  if (!user) return apiError("UNAUTHORIZED", "Admin access required.", 401);

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid values.", details: parsed.error.flatten() } }, { status: 400 });
  }

  const updates = parsed.data;

  // Fetch current values to validate sum after patch
  const rows = await prisma.bidPlatformSetting.findMany({
    where: { key: { in: ["scoring_weight_price", "scoring_weight_quantity"] } },
    select: { key: true, value: true },
  });
  const current: Record<string, number> = {};
  for (const r of rows) current[r.key] = parseFloat(r.value);

  const newPrice = updates.scoring_weight_price ?? current["scoring_weight_price"] ?? 70;
  const newQty = updates.scoring_weight_quantity ?? current["scoring_weight_quantity"] ?? 30;
  const sum = Math.round((newPrice + newQty) * 100) / 100;

  if (sum !== 100) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: `Price weight (${newPrice}%) and quantity weight (${newQty}%) must sum to 100%. Current sum: ${sum}%.` } }, { status: 400 });
  }

  const ops = Object.entries(updates).map(([key, value]) =>
    prisma.bidPlatformSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    })
  );

  await prisma.$transaction(ops);

  return NextResponse.json({ ok: true, scoring_weight_price: newPrice, scoring_weight_quantity: newQty, outlier_flagging_threshold_percentage: updates.outlier_flagging_threshold_percentage ?? (current["outlier_flagging_threshold_percentage"] ?? 30) });
}
