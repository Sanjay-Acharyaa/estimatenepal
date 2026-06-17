import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { uploadBuffer } from "@/lib/upload";
import { appendAuditLog } from "@/lib/audit";

// PUT /api/projects/[id]/drawings/[drawingId]/thumbnail
// Body: raw WebP bytes (Content-Type: image/webp)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const drawing = await prisma.drawing.findUnique({ where: { id: params.drawingId } });
    if (!drawing || drawing.projectId !== params.id) throw notFound("Drawing");

    const bytes = await req.arrayBuffer();
    if (bytes.byteLength === 0) return NextResponse.json({ thumbnailUrl: null });

    const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB
    if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json({ error: { message: "Thumbnail must be under 2 MB." } }, { status: 413 });
    }

    // Verify RIFF/WEBP magic bytes to prevent content-type spoofing
    const header = new Uint8Array(bytes, 0, 12);
    const isRiff = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
    const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
    if (!isRiff || !isWebp) {
      return NextResponse.json({ error: { message: "Only WebP images are accepted." } }, { status: 400 });
    }

    const key = `thumbnails/${project.orgId}/${params.drawingId}.webp`;
    await uploadBuffer(key, Buffer.from(bytes), "image/webp");

    await prisma.drawing.update({
      where: { id: params.drawingId },
      data: { thumbnailUrl: key },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "drawing.thumbnail_updated",
      resourceId: params.drawingId,
      meta: { key },
      ipAddress: ip,
    });

    return NextResponse.json({ thumbnailUrl: key });
  } catch (err) {
    return handleApiError(err);
  }
}
