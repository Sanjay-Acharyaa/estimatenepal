import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcrypt";

const bodySchema = z.object({
  passphrase: z.string().min(12).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Admin access required." } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Passphrase must be at least 12 characters.", details: parsed.error.flatten() } }, { status: 400 });
  }

  const hash = await bcrypt.hash(parsed.data.passphrase, 12);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { secondaryPassphraseHash: hash },
  });

  return NextResponse.json({ ok: true });
}
