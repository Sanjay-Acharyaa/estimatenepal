import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "us-east-1",
  endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
  },
});

const BUCKET = process.env.STORAGE_BUCKET ?? "nepaliestimate-files";

// PUT /api/projects/[id]/drawings/[drawingId]/thumbnail
// Body: raw WebP/JPEG bytes (Content-Type: image/webp)
// Uploads thumbnail to storage, saves key to drawing.thumbnailUrl
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const drawing = await prisma.drawing.findUnique({ where: { id: params.drawingId } });
    if (!drawing || drawing.projectId !== params.id) throw notFound("Drawing");

    const bytes = await req.arrayBuffer();
    if (bytes.byteLength === 0) return NextResponse.json({ thumbnailUrl: null });

    const key = `thumbnails/${project.orgId}/${params.drawingId}.webp`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: "image/webp",
    }));

    await prisma.drawing.update({
      where: { id: params.drawingId },
      data: { thumbnailUrl: key },
    });

    return NextResponse.json({ thumbnailUrl: key });
  } catch (err) {
    return handleApiError(err);
  }
}
