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

// Only relative Bidding paths are allowed in return_to to prevent open-redirect abuse.
// The value is embedded in a signed JWT so it cannot be tampered with in transit.
const RETURN_TO_RE = /^\/[a-zA-Z0-9/_?=&%+.-]*$/;

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

  const rawReturnTo = req.nextUrl.searchParams.get("return_to") ?? "";
  const returnTo =
    rawReturnTo.length > 0 &&
    rawReturnTo.length <= 300 &&
    RETURN_TO_RE.test(rawReturnTo)
      ? rawReturnTo
      : null;

  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    type: "sso",
    email: session.user.email,
    name: session.user.name ?? session.user.email,
    iat: now,
    exp: now + 60,
  };
  if (returnTo) payload.return_to = returnTo;

  const token = makeSSOToken(payload, ssoSecret);

  const dest = new URL("/bid/api/auth/sso", biddingUrl);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest.toString());
}
