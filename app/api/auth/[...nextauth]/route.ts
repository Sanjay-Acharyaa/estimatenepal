import { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/security";

const nextAuthHandler = NextAuth(authOptions);

export async function GET(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  return (nextAuthHandler as any)(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  // Apply rate limit on the credentials sign-in endpoint before NextAuth processes it
  if (ctx.params.nextauth?.join("/") === "callback/credentials") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const limited = await checkLoginRateLimit(ip);
    if (limited) return limited;
  }
  return (nextAuthHandler as any)(req, ctx);
}
