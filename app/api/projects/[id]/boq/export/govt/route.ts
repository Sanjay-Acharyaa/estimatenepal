import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { buildGovtBOQExcel, type GovtBOQMeta } from "@/lib/export";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";

export const maxDuration = 60;

// GET /api/projects/[id]/boq/export/govt
// Generates a Nepal government-standard BOQ (DUDBC format) as Excel.
// Query params: ministry, department, office, schemeNo, ward, fiscalYear,
//               contractorName, preparedBy, checkedBy, approvedBy
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true, name: true, district: true, clientCompany: true, projectNumber: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("govt_boq_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);
    const qp = req.nextUrl.searchParams;

    const meta: GovtBOQMeta = {
      ministry:       qp.get("ministry")       ?? undefined,
      department:     qp.get("department")     ?? undefined,
      office:         qp.get("office")         ?? undefined,
      projectName:    project.name,
      schemeNo:       qp.get("schemeNo")       ?? project.projectNumber ?? undefined,
      district:       qp.get("district")       ?? project.district      ?? undefined,
      ward:           qp.get("ward")           ?? undefined,
      fiscalYear:     qp.get("fiscalYear")     ?? undefined,
      contractorName: qp.get("contractorName") ?? project.clientCompany ?? undefined,
      preparedBy:     qp.get("preparedBy")     ?? undefined,
      checkedBy:      qp.get("checkedBy")      ?? undefined,
      approvedBy:     qp.get("approvedBy")     ?? undefined,
    };

    const result = await withSemaphore("excel", 5, async () => {
      const buffer = await buildGovtBOQExcel(boq, meta);
      const filename = `GovtBOQ_${project.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
