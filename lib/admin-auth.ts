import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "./prisma";
import { unauthorized, forbidden } from "./errors";

/**
 * Verifies the request is from a superadmin via JWT AND a live DB check.
 * The DB check guards against stale JWTs issued before isSuperAdmin was revoked.
 */
export async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const dbUser = await prisma.user.findUnique({
    where:  { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!dbUser?.isSuperAdmin) throw forbidden();
  return token;
}
