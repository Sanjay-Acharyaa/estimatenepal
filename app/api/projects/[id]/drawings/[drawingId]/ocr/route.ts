import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkOcrRateLimit, getClientIp } from "@/lib/security";
import { recognizeText } from "@/lib/ocr";
import { withSemaphore } from "@/lib/semaphore";

// ~4MB base64 ≈ 3MB raw image — enough for a title-block crop
const MAX_IMAGE_B64 = 4 * 1024 * 1024;

const schema = z.object({
  imageBase64: z
    .string()
    .min(1)
    .max(MAX_IMAGE_B64, { message: "Image too large (max ~3 MB)." }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkOcrRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const drawing = await prisma.drawing.findUnique({ where: { id: params.drawingId } });
    if (!drawing || drawing.projectId !== params.id) throw notFound("Drawing");

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    // Limit concurrent Tesseract workers to 4 to cap CPU usage per replica.
    const result = await withSemaphore("ocr", 4, async () => {
      const text = await recognizeText(parsed.data.imageBase64);
      return NextResponse.json({ text });
    });
    return result as NextResponse;
  } catch (err) {
    return handleApiError(err);
  }
}
