import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { buildBOQPdf } from "@/lib/export";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { checkExportRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";

export const maxDuration = 60;

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkExportRateLimit(ip);
    if (limited) return limited;

    if (!PROJECT_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid project ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true, name: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("pdf_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);

    // Limit concurrent Puppeteer instances to 3 to prevent OOM and Chrome spawn queue exhaustion.
    const result = await withSemaphore("pdf", 3, async () => {
      const buffer = await buildBOQPdf(boq);
      const filename = `BOQ_${project.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": buffer.length.toString(),
        },
      });
    });
    return result as Response;
  } catch (err) {
    return handleApiError(err);
  }
}
