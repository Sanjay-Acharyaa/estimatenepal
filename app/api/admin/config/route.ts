export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { getAllConfigs, setConfig, CONFIG_DESCRIPTIONS, CONFIG_DEFAULTS } from "@/lib/config";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  // Re-verify in DB — guards against stale JWT after isSuperAdmin was revoked
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.string().max(2000),
});

// Superadmin: get all config values with metadata
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    await requireSuperAdmin(req);

    const values = await getAllConfigs();

    // Return enriched list with descriptions and defaults
    const entries = Object.keys(CONFIG_DEFAULTS).map((key) => ({
      key,
      value: values[key] ?? CONFIG_DEFAULTS[key] ?? "",
      default: CONFIG_DEFAULTS[key] ?? "",
      description: CONFIG_DESCRIPTIONS[key] ?? "",
    }));

    return NextResponse.json(entries);
  } catch (err) {
    return handleApiError(err);
  }
}

// Superadmin: update a single config value
export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    // Only allow known keys to prevent arbitrary key injection
    if (!(parsed.data.key in CONFIG_DEFAULTS)) {
      return apiError("VALIDATION_ERROR", `Unknown config key: ${parsed.data.key}`, 400);
    }

    await setConfig(parsed.data.key, parsed.data.value);
    return NextResponse.json({ message: "Config updated.", key: parsed.data.key, value: parsed.data.value });
  } catch (err) {
    return handleApiError(err);
  }
}
