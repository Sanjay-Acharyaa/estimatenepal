import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const createSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  type: z.enum(["LINEAR", "AREA", "VOLUME", "COUNT", "COUNT_BY_DISTANCE", "VERTICAL_WALL_AREA"]).default("LINEAR"),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
  lineWidth: z.number().int().min(1).max(10).default(2),
  rateCode: z.string().max(50).nullable().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

// POST /api/assemblies/[id]/groups — add a group/layer to an org assembly
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    const assembly = await prisma.assembly.findUnique({ where: { id: params.id } });
    if (!assembly) throw notFound("Assembly");
    if (!assembly.orgId || assembly.orgId !== orgId) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const group = await prisma.assemblyGroup.create({
      data: {
        assemblyId: params.id,
        name: parsed.data.name,
        type: parsed.data.type,
        colour: parsed.data.colour,
        lineWidth: parsed.data.lineWidth,
        rateCode: parsed.data.rateCode ?? null,
        parentId: parsed.data.parentId ?? null,
        sortOrder: parsed.data.sortOrder,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
