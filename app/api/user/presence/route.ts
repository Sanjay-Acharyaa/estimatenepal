import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pingPresence } from "@/lib/presence";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { path } = await req.json().catch(() => ({ path: "/" }));

  // Get org name for display in admin panel
  let orgName: string | null = null;
  if (session.user.orgId) {
    const org = await prisma.org.findUnique({
      where: { id: session.user.orgId },
      select: { name: true },
    }).catch(() => null);
    orgName = org?.name ?? null;
  }

  await pingPresence(
    session.user.id,
    session.user.name ?? "Unknown",
    session.user.email ?? "",
    session.user.orgId ?? null,
    orgName,
    typeof path === "string" ? path : "/",
  );

  return NextResponse.json({ ok: true });
}
