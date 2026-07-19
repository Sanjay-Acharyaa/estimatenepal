import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { buildBOQExcel, ExportColConfig } from "@/lib/export";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { checkExportRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";

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
      select: { id: true, orgId: true, name: true, exportConfig: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("excel_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);

    // Merge saved config with query-param overrides (query takes precedence for one-off exports)
    const saved = (project.exportConfig ?? {}) as Record<string, unknown>;
    const qp = req.nextUrl.searchParams;

    const customColsParam = qp.get("customCols");
    const customCols = customColsParam
      ? customColsParam.split(",").map(s => s.trim()).filter(Boolean)
      : ((saved.customCols as string[] | undefined) ?? []);

    const colConfig: ExportColConfig = {
      showSno:    (qp.has("showSno")    ? qp.get("showSno")    === "1" : ((saved.showSno    as boolean) ?? true)),
      showUnit:   (qp.has("showUnit")   ? qp.get("showUnit")   === "1" : ((saved.showUnit   as boolean) ?? true)),
      showQty:    (qp.has("showQty")    ? qp.get("showQty")    === "1" : ((saved.showQty    as boolean) ?? true)),
      showRate:   (qp.has("showRate")   ? qp.get("showRate")   === "1" : ((saved.showRate   as boolean) ?? true)),
      showAmount: (qp.has("showAmount") ? qp.get("showAmount") === "1" : ((saved.showAmount as boolean) ?? true)),
      customCols,
    };

    const result = await withSemaphore("excel", 5, async () => {
      const buffer = await buildBOQExcel(boq, colConfig);
      const filename = `BOQ_${project.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
