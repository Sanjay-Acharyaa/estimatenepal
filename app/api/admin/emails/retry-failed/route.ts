import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/emails/retry-failed
// Admin-only. Triggers the cron to re-run, which will pick up any failed emails
// (dedup only skips emails with status="sent", so failed ones get retried).
// Redis 6-hour lock is cleared first so the cron can run immediately.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { email: session!.user!.email! },
    select: { isSuperAdmin: true },
  });
  if (!dbUser?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const baseUrl    = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  // Fire cron in background — don't await so this route returns immediately
  fetch(`${baseUrl}/api/cron/trial-reminder`, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  }).catch(err => console.error("[retry-failed] Cron trigger failed:", err.message));

  // Redirect back to analytics page
  return NextResponse.redirect(new URL("/admin/analytics", baseUrl));
}
