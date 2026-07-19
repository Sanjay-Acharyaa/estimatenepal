import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { buildGovtBOQExcel, type GovtBOQMeta } from "@/lib/export";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { checkExportRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const GOVT_FIELD_MAX = 200;

export const maxDuration = 60;

// GET /api/projects/[id]/boq/export/govt
// Generates a Nepal government-standard BOQ (DUDBC format) as Excel.
// Query params: ministry, department, office, schemeNo, ward, fiscalYear,
//               contractorName, preparedBy, checkedBy, approvedBy
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
      select: { id: true, orgId: true, name: true, district: true, clientCompany: true, projectNumber: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("govt_boq_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);
    const qp = req.nextUrl.searchParams;

    const trim = (v: string | null, fallback?: string | null) =>
      (v ?? fallback ?? "").slice(0, GOVT_FIELD_MAX) || undefined;

    const meta: GovtBOQMeta = {
      ministry:       trim(qp.get("ministry")),
      department:     trim(qp.get("department")),
      office:         trim(qp.get("office")),
      projectName:    project.name,
      schemeNo:       trim(qp.get("schemeNo"), project.projectNumber),
      district:       trim(qp.get("district"), project.district),
      ward:           trim(qp.get("ward")),
      fiscalYear:     trim(qp.get("fiscalYear")),
      contractorName: trim(qp.get("contractorName"), project.clientCompany),
      preparedBy:     trim(qp.get("preparedBy")),
      checkedBy:      trim(qp.get("checkedBy")),
      approvedBy:     trim(qp.get("approvedBy")),
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
