export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = getClientIp(req);
  const limited = await checkApiRateLimit(ip);
  if (limited) return limited;

  const session = await getSession();
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { email: session!.user!.email! },
    select: { isSuperAdmin: true },
  });
  if (!dbUser?.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notes } = await req.json();
  if (typeof notes !== "string") {
    return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
  }

  await prisma.org.update({
    where: { id: params.id },
    data: { adminNotes: notes.trim() || null },
  });

  return NextResponse.json({ ok: true });
}