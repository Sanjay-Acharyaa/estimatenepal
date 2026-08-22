import { type NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";

function makeSSOToken(
  payload: Record<string, unknown>,
  secret: string
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const ssoSecret = process.env.SSO_SECRET;
  if (!ssoSecret) {
    return NextResponse.json(
      { error: "SSO is not configured on this server." },
      { status: 503 }
    );
  }

  const biddingUrl =
    (await getConfig("bidding_url")) || "http://localhost:3001";

  const now = Math.floor(Date.now() / 1000);
  const token = makeSSOToken(
    {
      type: "sso",
      email: session.user.email,
      name: session.user.name ?? session.user.email,
      iat: now,
      exp: now + 60,
    },
    ssoSecret
  );

  const dest = new URL("/api/auth/sso", biddingUrl);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest.toString());
}
