import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSecurityHeaders } from "@/lib/headers";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/share",          // Public read-only share link viewer
  "/api/invite",     // Public invite accept
  "/trial-expired",  // Must be accessible without auth
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Apply security headers to all responses
  const res = NextResponse.next();
  const headers = getSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return res;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Super-admin-only routes
  if (pathname.startsWith("/admin") && !token.isSuperAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Trial enforcement — block dashboard access when trial has expired (non-super-admins only)
  if (pathname.startsWith("/dashboard") && !token.isSuperAdmin && token.trialEndsAt) {
    const trialEnd = new Date(token.trialEndsAt as string);
    if (trialEnd < new Date()) {
      return NextResponse.redirect(new URL("/trial-expired", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
