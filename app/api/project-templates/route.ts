import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit } from "@/lib/security";

const createSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  description: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  sourceProjectId: z.string().optional(), // if set, snapshot from existing project
  structure: z.any().optional(),           // or pass raw structure
});

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) throw forbidden();

    const templates = await prisma.projectTemplate.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (err) { return handleApiError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    let structure = parsed.data.structure ?? { disciplines: [] };

    if (parsed.data.sourceProjectId) {
      const disciplines = await prisma.discipline.findMany({
        where: { projectId: parsed.data.sourceProjectId, project: { orgId } },
        include: {
          groups: {
            where: { parentId: null },
            include: {
              children: {
                include: { rateItem: { select: { code: true } } },
                orderBy: { sortOrder: "asc" },
              },
              rateItem: { select: { code: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      structure = {
        disciplines: disciplines.map(d => ({
          name: d.name,
          isPrimary: d.isPrimary,
          groups: d.groups.map(g => ({
            name: g.name,
            type: g.type,
            colour: g.colour,
            lineWidth: g.lineWidth,
            rateCode: g.rateItem?.code ?? null,
            children: g.children.map(c => ({
              name: c.name,
              type: c.type,
              colour: c.colour,
              lineWidth: c.lineWidth,
              rateCode: c.rateItem?.code ?? null,
            })),
          })),
        })),
      };
    }

    const tpl = await prisma.projectTemplate.create({
      data: {
        orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        structure,
        createdBy: token.id as string,
      },
    });
    return NextResponse.json(tpl, { status: 201 });
  } catch (err) { return handleApiError(err); }
}
