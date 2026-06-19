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

  // Root is the public landing page — allow unauthenticated access
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return res;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
  });

  if (!token || (token as any).invalidated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    if ((token as any)?.invalidated) loginUrl.searchParams.set("reason", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  // Super-admin-only routes
  if (pathname.startsWith("/admin") && !token.isSuperAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // ── Trial enforcement ────────────────────────────────────────────────────────
  // Applies to non-super-admins whose org has a trialEndsAt set.
  // Orgs created before trial enforcement (trialEndsAt = null) are unaffected.

  const isTrialExpired =
    !token.isSuperAdmin &&
    !!token.trialEndsAt &&
    new Date(token.trialEndsAt as string) < new Date();

  if (isTrialExpired) {
    // Dashboard pages → redirect to the trial-expired UI
    if (pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/trial-expired", req.url));
    }

    // API calls → return 403 JSON.
    // /api/auth and /api/invite are already public (handled above, never reach here).
    // /api/coupons/redeem must stay open — it is how an expired user regains access.
    // /api/admin is covered by the !token.isSuperAdmin condition above.
    if (
      pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/coupons/redeem")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "TRIAL_EXPIRED",
            message: "Your free trial has ended. Please contact us to continue.",
          },
        },
        { status: 403 }
      );
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
